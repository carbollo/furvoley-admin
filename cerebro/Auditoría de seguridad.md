---
tags: [seguridad, auditoria, multi-tenant, cross-tenant, server-actions, contabilidad, webhook, rbac]
---

# Auditoría de seguridad

Auditoría **multi-agente completa** del CRM realizada el **26-27 de julio de 2026**: **29 hallazgos confirmados** (más 3 falsos positivos), clasificados por severidad. **Todos arreglados, verificados adversarialmente y desplegados**, salvo dos residuos de baja prioridad que se anotan al final. El hilo conductor de casi todos los fallos es la naturaleza multi-tenant de la [[Arquitectura Modelo C]]: dinero, datos y sesiones deben quedar acotados al club activo.

## Alcance y método

- Barrido de todo el repo por agentes en paralelo, con **verificación adversarial** (cierre + regresión) de cada fix antes de darlo por bueno.
- Dos ejes de riesgo dominantes: **fuga de datos entre clubes** (aislamiento) y **corrupción de dinero/contabilidad** (numeración, idempotencia, atomicidad).
- Todos los despliegues afectan al servicio **crm-mt** (los CRM de los clubes); la auditoría del webhook toca el servicio **portal**.

## Críticos: fuga entre clubes (2)

Los dos únicos críticos rompían el [[Aislamiento entre clubes]] permitiendo cruzar la frontera de tenant.

- **C1 — confianza en `x-tenant-slug` del cliente** (`src/lib/multitenant/request.ts`). El login resolvía el tenant a partir de un header enviable por el cliente porque `/api/auth` está **excluido del middleware**. Un atacante podía autenticarse contra la BD de otro club. Fix: en `enterTenantFromHeaders` el tenant se resuelve **solo por host** salvo la flag `TENANT_ALLOW_OVERRIDE`. Ver [[Resolución de tenant]].
- **C2 — JWT sin claim de tenant y secreto compartido** (`rbac-api.ts` / `session.ts` / `auth.ts`). Como todos los clubes firman con el mismo secreto y el token no llevaba tenant, **un token de club A valía en club B**. Fix: punto único `sessionMatchesActiveTenant` en el nuevo `src/lib/tenant-session.ts`, aplicado en el callback `session` (borra `session.user` si no coincide), en la rama Bearer de `session.ts`; `portal-sso.ts`/`auth.ts` emiten el claim `tenant`. Tokens heredados sin claim se validan comprobando que el usuario existe en la BD del club activo. Detalle en [[Autenticación y sesiones]].

## Altos: dinero y contabilidad (8)

Ocho hallazgos de severidad alta, casi todos sobre integridad financiera. Contexto en [[Contabilidad]] y [[Facturación, cuotas y Stripe]].

- **Numeración por carrera:** nº de factura y de asiento pasaban de `count()+1` a **`max()+1` con reintento P2002** (`crm-invoice-create.ts`, `accounting/engine.ts`).
- **Webhook Stripe no idempotente:** `onCheckoutSessionCompleted` ahora **deduplica** por `payment_intent`/`session.id`.
- **Crons ciegos al tenant:** `jobs/billing`, `billing-cycle`, `document-expiring` envueltos en `forEachTenant`.
- **`/join` sin contexto de tenant** (`join-action.ts`): metido en `runWithTenant`; además se endureció `resolveTenantCtx` (host-autoritativo, no confía en `x-tenant-slug` fuera del middleware).
- **Asientos descuadrados:** allowlist DEBIT/CREDIT en `createJournalEntry`.
- **Atomicidad de suscripciones:** `createInvoiceForSubscription` emite factura + avanza la fecha en un `$transaction`; `generateDueInvoices` aísla por-suscripción.
- **Editor de cuotas:** ya **no reasigna el plan en silencio**.

## Clase sistémica: server actions sin auth (49 en 8 ficheros)

Una auditoría dedicada halló **49 server actions expuestos como RPC sin autenticación propia** — el patrón de fallo más peligroso del repo, documentado en [[Server actions y seguridad]]. Cualquier `'use server'` es un endpoint POST invocable por cualquiera; muchos ejecutaban CRUD (incluido **borrado en cascada de socios**) sin comprobar rol ni tenant.

Patrón de cierre reutilizable:

- **Si ningún cliente importa el módulo** → quitarle `'use server'` (deja de ser RPC). Aplicado a `actions/billing.ts`, `workflows.ts`, `leads.ts`.
- **Si hay cliente** → `runWithTenant` + assert de rol dentro de cada action, **o** mover la lógica a un módulo de servicio sin `'use server'`. Así nacieron `src/lib/members-service.ts` y `src/lib/events-service.ts`.

Casos concretos: member CRUD movido a `members-service.ts`; contabilidad/pagos/recordatorios con `assertAccountingStaff` (ADMIN/TREASURER); `signup-links.ts`, `bank-import.ts`, `store.ts`, `meta.ts` acotados por rol. Los server actions de **eventos** (`app/actions/events.ts` y el módulo paralelo `actions/events.ts`) exigen ahora staff (`assertEventWriter`/`assertEventStaff`); la ruta pública por token usa `updateAttendanceInternal`. Ver [[Eventos y asistencia]].

## Medios y bajos (11 + 5)

Todos arreglados y desplegados. Selección de los más relevantes:

- **M1** API pública v1: `assertPublicSportsApiAuth` async + `enterTenantFromRequest` (punto único de tenant).
- **M3** rate-limit de login: contador **por-email** (`acct::`) además de por-IP; `clientIpFromHeaders` prioriza `cf-connecting-ip`/`x-real-ip` (trade-off deliberado: lockout por-cuenta 15 min, umbral 30).
- **M4** `recordInvoicePayment`: incremento + status en el **mismo `$transaction`** (row-lock; ya no queda un pago PAID marcado como PARTIAL).
- **M7** `APPLY_DISCOUNT_RULES` idempotente (línea marcador, no reaplica) y **M6** `SEND_WHATSAPP` con fallback a `member.phone` solo si la plantilla apunta al socio — ver [[Motor de workflows]].
- **B3** `runWaitlistSlotWorkflows`: guarda de re-entrada con AsyncLocalStorage (por-contexto, no bloquea a otros tenants) y **B4** `BRANCH_IF` back-edge sin re-ejecutar efectos.
- Validaciones: allowlist de `nature`, IVA/retención 0-100, totales no negativos; consumo atómico de enlaces de alta (`updateMany` condicional).

## Auditoría dedicada del webhook de alta

El webhook de [[Alta automática por webhook]] (servicio portal) recibió su propia auditoría — **10 hallazgos en total, todos cerrados**:

- **ALTO DoS:** sin rate-limit ni concurrencia, un token filtrado tumbaba el portal (cada POST lanza `CREATE DATABASE` + `prisma db push`). Fix: `webhook-limit.ts` con rate-limit por token + semáforo de aprovisionamiento (429/503 con `Retry-After`).
- **MEDIO inyección de destinatario SMTP:** email validado solo con `includes('@')` permitía listas con coma → multi-destinatario en nodemailer → phishing con el dominio Mailgun. Fix: `isSingleEmail` en provision-club, `createPortalUser` y el sink del mailer.
- **MEDIO TOCTOU / rollback:** reintentos recibían "idempotent OK" aunque el original fallara (set en memoria `provisioning` → 503 `pending`); `assignPlanToTenant` ahora se aplica **antes** de `provisionTenant` con rollback completo si falla.
- **Auth de super-admins:** resetear la contraseña no expulsaba la sesión HMAC → `PortalAdmin.sessionsInvalidBefore` + `iat` en el token. Ver [[Panel de administración del portal]] y [[Planes y facturación del portal]].
- **No implementado (defensa en profundidad):** el token viaja en la URL sin firma HMAC del cuerpo; mitigado por entropía (192 bits), rotación manual y rate-limit. Cierre pendiente: que la tienda firme el body.

## Residuos de baja prioridad (no bloqueantes)

- **Dedupe del webhook Stripe no atómico:** el check-then-insert deja una ventana de carrera. Cierre definitivo: índice **UNIQUE** en `PaymentAttempt.stripePaymentIntent`/`stripeSessionId` (requiere migración all-tenants).
- **Numeración de ancho fijo** (5/6 dígitos): asume < 100k documentos/año por club.

Ambos requieren coordinación operativa (migración a todas las BD de tenant); ver [[Operaciones, entorno y convenciones]].

## Relacionado

- [[Aislamiento entre clubes]]
- [[Server actions y seguridad]]
- [[Autenticación y sesiones]]
- [[Facturación, cuotas y Stripe]]
- [[Alta automática por webhook]]
- [[Arquitectura Modelo C]]
