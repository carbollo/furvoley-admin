---
tags: [alta-automatica, webhook, aprovisionamiento, smtp, mailgun, idempotencia, rate-limit, portal-central]
---

# Alta automática por webhook

## Qué es

Un **endpoint de webhook por-plan** que permite que una **tienda externa** (checkout, pasarela de suscripciones) gestione el ciclo de vida de un club **sin intervención humana**. En el alta, el portal provisiona un club completo (Tenant + BD aislada + admin), genera una **contraseña de 24 caracteres** y la envía por SMTP (Mailgun). Además es **multi-evento**: la misma URL procesa cambios de plan, cancelaciones e impagos.

## Multi-evento (`classifyEvent` en el route)

El body debe llevar un campo de tipo (`type`/`event`/`event_type`/`action`/`topic`/`status`); `classifyEvent` lo normaliza por substring a: `create | update | cancel | payment_failed | payment_ok`. **Sin tipo o desconocido → `create`** (retrocompatible con integraciones que solo mandan altas). El **plan lo determina la URL** (el token), así que la tienda envía cada evento a la URL del plan correspondiente — no hace falta un mapa plan-tienda→Plan. Ramas (todas idempotentes por email, funciones en `provision-club.ts`):
- **`create`** → flujo de alta pesado de siempre (semáforo + `provisionClubFromSubscription` + email).
- **`update`** (`updated`/`upgrade`/`downgrade`) → `changeClubPlan(email, plan.id)`: `assignPlanToTenant` al plan de la URL, reactiva si estaba suspendido y quita la etiqueta `impago`. **Si el email no tiene club → cae al flujo de create** (recuperación). Audita `WEBHOOK_PLAN_CHANGE`.
- **`cancel`** (`canceled`/`deleted`/`refund`/`suspend`…) → `cancelClub`: `setTenantStatus(SUSPENDED)` (conserva la BD y los datos). Audita `WEBHOOK_CANCEL`.
- **`payment_failed`** (`past_due`/`unpaid`…) → `markClubPaymentFailed`: añade la etiqueta **`impago`** (`IMPAGO_TAG`); **no suspende** (eso es del super-admin o un futuro dunning). Audita `WEBHOOK_PAYMENT_FAILED`.
- **`payment_ok`** (`invoice.paid`/`payment_succeeded`/`renewed`…) → `markClubPaymentOk`: quita `impago` y reactiva si estaba suspendido. Audita `WEBHOOK_PAYMENT_OK`.

Los eventos ligeros (todos menos create) **NO pasan por el semáforo de concurrencia** (solo tocan la BD del portal). Buscan el club por el email del `PortalUser` ADMIN (`findClubByEmail`); si no existe, responden **200** `found:false` sin romper (salvo `update`, que provisiona). Gotcha: `addTenantTag`/`removeTenantTag` hacen read-modify-write **no atómico** (mismo modelo que el resto de guards en memoria; ver más abajo). Riesgo asumido: la reactivación en `update`/`payment_ok` puede revertir una suspensión **manual** del admin — es intencional (un pago al día = acceso).

- **Ruta**: `POST /api/portal-central/webhooks/subscription/[token]` (`src/app/api/portal-central/webhooks/subscription/[token]/route.ts`, `dynamic = 'force-dynamic'`, solo `POST`).
- **Solo en el servicio portal**: si `!isPortalCentralHost()` responde **404**. Ver [[Arquitectura Modelo C]].
- **Un token por plan**: la URL incrusta `Plan.webhookToken`, así la tienda que compra "Plan Pro" cae en el plan correcto.

## Autenticación: token de la URL + firma HMAC opcional por plan

El token de la URL **siempre** es credencial; además, cada plan puede **exigir firma HMAC** del cuerpo (opt-in, recomendado desde que el webhook es multi-evento y puede cancelar/degradar clubes).

- **`Plan.webhookSecret`** (`String?`, `schema.prisma`): `randomBytes(32).hex` (64 hex). Se activa/rota desde el panel (`ensure`/`regeneratePlanWebhookSecret`, PATCH `/admin/plans` con `ensureWebhookSecret`/`regenerateWebhookSecret`, auditado `ENSURE_PLAN_WEBHOOK_SECRET`/`REGEN_PLAN_WEBHOOK_SECRET`).
- **Si el plan tiene secreto → se EXIGE firma válida**; si no, no se exige (**retrocompatible**). El secreto vive en la fila `Plan` del token, así que un atacante no puede forzar el modo sin-firma.
- **Verificación** (`route.ts`): se lee el cuerpo **crudo una sola vez** (`request.text()`), se calcula `HMAC-SHA256(rawBody, secret)` y se compara en **tiempo constante** (`timingSafeEqual`, con chequeo de longitud previo y regex hex para no truncar) contra la cabecera `X-Webhook-Signature` (o `X-Signature`/`X-Hub-Signature-256`/`X-Hmac-Signature`; admite prefijo `sha256=`). El gate va **tras** resolver el plan y el rate-limit y **antes** de parsear/actuar. Verificado **fail-closed**: sin firma válida → 401.
- El **mismo `rawBody`** se parsea después (JSON → fallback `URLSearchParams`). Gotchas menores (LOW, sin arreglar): sin protección de **replay** (sin nonce/timestamp; mitigado por HTTPS + idempotencia por email); `.update(rawBody,'utf8')` re-codifica UTF-8 (byte-exacto para JSON real; falla-cerrado con bytes no-UTF-8); el rate-limit por token cuenta también las peticiones sin firmar.

### El token (sigue siendo credencial base)

- **`Plan.webhookToken`**: `randomBytes(24).toString('hex')` → **48 hex**, `@unique` en el esquema (`schema.prisma:1170`).
- Cada plan **nace con su token** (`createPlan` lo pone en `newWebhookToken()`). Se puede **generar/rotar** desde el panel vía `PATCH /admin/plans` con `ensureWebhook`/`regenerateWebhook` (`ensurePlanWebhookToken` / `regeneratePlanWebhookToken`), auditado como `ENSURE_PLAN_WEBHOOK`/`REGEN_PLAN_WEBHOOK`. Rotar **invalida la URL anterior**.
- El super-admin **copia la URL completa** desde el UI del panel (`PortalLoginForm.tsx`). Ver [[Planes y facturación del portal]] y [[Panel de administración del portal]].
- El handler resuelve el plan con `findPlanByWebhookToken(token)`; token desconocido o revocado → **404** (sin distinguir "no existe" de "revocado").

## Flujo del handler

1. Comprueba host portal y resuelve el plan por token (404 si falla).
2. **Rate-limit por token** (`checkWebhookRate`) → **429** con `Retry-After` si excede.
3. **Parseo tolerante del body**: intenta `request.json()`; si falla, cae a `formData()` (algunas tiendas mandan `form-urlencoded`). `pick()` busca el **email** entre muchas claves candidatas (`email`, `customer_email`, `buyer.email`, `data.email`…) y el **nombre del club** igual. Sin email → **400**.
4. **Semáforo de concurrencia** (`tryAcquireProvisionSlot`) → **503** `Retry-After: 10` si saturado; se libera siempre en `finally`.
5. `provisionClubFromSubscription({ planId, email, clubName })`.
6. Ramas del resultado:
   - **`pending`** (otra entrega está aprovisionando este email) → **503** `Retry-After: 15`. **No** se declara éxito idempotente.
   - **`alreadyProvisioned`** → audita `WEBHOOK_SUBSCRIPTION_DUP` y devuelve `{ ok:true, idempotent:true }` sin duplicar.
   - **Club nuevo** → `sendWelcomeEmail`, audita `WEBHOOK_SUBSCRIPTION` (con flag `emailed`) y devuelve el slug/nombre del club.

## Aprovisionamiento (`provision-club.ts`)

`provisionClubFromSubscription` orquesta el alta con **rollback total** si algo falla:

- **Valida** email (`isSingleEmail`) y exige `TENANT_DB_BASE_URL`.
- **Slug**: `uniqueSlug` (slugify NFD, rechaza `RESERVED_SLUGS` como `www/app/portal/admin/api`, resuelve colisiones con sufijo numérico y, en su defecto, hex aleatorio).
- **Contraseña**: `randomPassword(24)` con alfabeto **sin caracteres ambiguos** (sin `0/O/1/l/I`).
- **Orden deliberado**: `createTenant` → `createPortalUser` (rol `ADMIN`) → `assignPlanToTenant` (**antes** del paso pesado, para no dejar clubes con `planId=null` si el aprovisionamiento fallara) → `provisionTenant` (crea la BD). Cualquier fallo revierte usuario + tenant.
- **`createPortalUser` reclama el email atómicamente** (`@unique`) **antes** de nada pesado. Si salta `P2002` (violación unique) → borra el tenant y trata como `alreadyProvisioned`. Este backstop de BD es la **garantía real de correctitud**.

### Idempotencia + guard TOCTOU

- **Idempotencia por email**: si ya existe `PortalUser` con ese email (`readExistingByEmail`), vía rápida a `alreadyProvisioned` → nunca dos clubes por el mismo cliente (las tiendas reintentan webhooks).
- **Guard TOCTOU** para reintentos **en vuelo**: un `Set<string>` en `globalThis.__provisioningEmails` marca los emails con alta en curso. Si llega un reintento mientras el original aún corre, responde `pending` (503), **no** "idempotente OK" — porque si el original fallara y revirtiera, se perdería el club en silencio. `has`+`add` son síncronos (Node monohilo) → sin carrera; se limpia en `finally`.

## Aprovisionamiento pesado (`provision.ts`)

`provisionTenant` hace `spawn` de `scripts/provision-tenant.cjs <slug>`: **`CREATE DATABASE` + `prisma db push` + seed del admin** (una BD por club, ver [[Aislamiento entre clubes]]). Idempotente (reusa la BD si ya existe). Corre en el proceso Node persistente del portal.

- **Gotcha de seguridad clave**: el email y sobre todo la **contraseña se pasan por variables de entorno del hijo** (`TENANT_ADMIN_EMAIL`/`TENANT_ADMIN_PASSWORD`), **nunca por argv** — los argumentos de proceso son legibles por `ps aux` / `/proc/<pid>/cmdline` y los capturan APM/colectores de logs.
- Salida capada a 20 KB (cola); **timeout 180 s** → `SIGKILL`.

## Email de bienvenida (`mailer.ts`)

- **Nodemailer sobre SMTP**, configurado por **variables de entorno del servicio portal** (`SMTP_HOST/PORT/SECURE/USER/PASS/FROM`) — **no se guardan credenciales en la BD**. Ver [[Operaciones, entorno y convenciones]].
- **Mailgun**: en puerto **587 se fuerza STARTTLS** (`requireTLS: !secure`) para que las credenciales **nunca viajen en claro**; 465 = TLS directo.
- `sendWelcomeEmail` manda usuario (email), contraseña de 24 chars, plan y **URL de acceso** (`clubLoginUrl`: `/portal` del portal, o subdominio del club). Todo el contenido dinámico va **HTML-escapado** (`esc`).
- `sendTestEmail` verifica la config desde el panel.

## Rate-limit y concurrencia (`webhook-limit.ts`)

Como cada POST válido lanza aprovisionamiento **pesado** (procesos + cientos de MB), un token filtrado podría tumbar el portal. Dos controles **en memoria** (`globalThis`, proceso persistente Railway):

- **Rate-limit por token**: `WEBHOOK_RATE_MAX` (30) por `WEBHOOK_RATE_WINDOW_MS` (60 s), bucket por token.
- **Semáforo de concurrencia global**: `WEBHOOK_MAX_CONCURRENT` (3) aprovisionamientos simultáneos.
- En ráfaga legítima que supere los topes → 429/503 con `Retry-After`; la tienda reintenta.
- **Gotcha**: al ser estado en memoria, los tres guards (rate-limit, semáforo, Set TOCTOU) **asumen un único proceso**; si el portal escalara a varias instancias no se coordinarían. La correctitud sigue garantizada por el `@unique` del email; estos guards son protección/UX, no la fuente de verdad.

## Endurecimiento de la auditoría

- El **log del aprovisionamiento** (salida de `prisma db push`, que expone host/BD internos) se registra con `console.error` en el servidor pero **NUNCA se devuelve al cliente**.
- El **error de SMTP** tampoco se devuelve crudo (revelaría relay/host internos): solo va a `console.error`; al cliente se le da una `note`.
- `clubName` se **acota a 120 chars** (un `name` sin límite del webhook podría ser de varios MB).
- Auditoría con `actor: 'webhook'` e IP del cliente. Ver [[Auditoría de seguridad]].

## Fallo del email = club creado igual

El club **queda creado aunque el email de bienvenida falle** (se devuelve `emailed:false` + `note`). El super-admin usa **"Reenviar acceso"** (`POST /admin/resend-access`) que **resetea la contraseña del `PortalUser` ADMIN activo** del club y la muestra una vez (no toca la BD del tenant). Cuenta como acción de [[Panel de administración del portal]] y usa las credenciales de [[Autenticación y sesiones]].

## Relacionado

- [[Planes y facturación del portal]]
- [[Panel de administración del portal]]
- [[Aislamiento entre clubes]]
- [[Arquitectura Modelo C]]
- [[Auditoría de seguridad]]
- [[Operaciones, entorno y convenciones]]
