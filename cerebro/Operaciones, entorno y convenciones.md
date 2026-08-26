---
tags: [operaciones, despliegue, railway, entorno, variables-entorno, cron, convenciones, multitenant]
---

# Operaciones, entorno y convenciones

Guía operativa del despliegue **Modelo C** en Railway: cómo arranca cada servicio, cómo se migran las BD de club, cómo corren las tareas programadas, la disciplina previa a cada deploy y el catálogo completo de variables de entorno. Contexto de arquitectura en [[Arquitectura Modelo C]].

## Despliegue en Railway

- Un único repo/imagen alimenta **dos servicios** en la rama `testing`, diferenciados solo por env vars: `crm-mt` (los CRM de los clubes, `MULTITENANT=true`) y `portal` (panel central + login, `PORTAL_CENTRAL_HOST=true`). El Postgres compartido `Postgres-9NHM` aloja la BD `portal` y una `tenant_<slug>` por cliente.
- Deploy: `railway up --service <svc> --detach`. **Gotcha clave**: `railway up` sube el árbol local y **retorna tras el upload**; el build es asíncrono. Hay que **sondear** `railway status --json` hasta `...serviceInstances...latestDeployment.status == "SUCCESS"` antes de dar por buena la release o de migrar.
- La BD apunta a `postgres-9nhm.railway.internal` (host **interno**, no resoluble desde tu máquina; `DATABASE_PUBLIC_URL` viene vacío). Para correr scripts contra ella, usa `railway ssh --service crm-mt node scripts/...` (el contenedor ya trae `prisma` + `pg`).

## Arranque de cada servicio (`db push` condicional)

`npm start` ejecuta `scripts/start-with-db-sync.cjs`, que ramifica según el modo:

- **Portal** (`PORTAL_CENTRAL_HOST=true`): delega en `start-portal-central.cjs`. Con `PORTAL_TENANT_MODE=true` hace `prisma db push --accept-data-loss` sobre su propia BD (tablas Tenant/PortalUser) — así el panel funciona en el primer despliegue — y luego `next start`. Si falta `NEXTAUTH_SECRET`, cae a `PORTAL_SSO_SECRET`.
- **Multi-tenant** (`MULTITENANT=true`): **omite** el `db push` y el bootstrap de admin. No hay una BD única que sincronizar; cada BD de cliente se crea y migra al provisionar.
- **Un-solo-club** (legacy): hace `db push` + `bootstrap-admin` contra `DATABASE_URL` antes de arrancar.

Ambos scripts reintentan el `db push` (`DB_SYNC_RETRIES=12`, `DB_SYNC_RETRY_DELAY_MS=5000`) para tolerar que Postgres tarde en estar listo.

## Migrar las BD de club tras un cambio de schema

Como en MT el arranque **no** hace `db push`, tras editar `prisma/schema.prisma` y desplegar `crm-mt` hay que correr `scripts/migrate-all-tenants.cjs`: enumera las BD `tenant_*` del servidor (`TENANT_DB_BASE_URL`) y ejecuta `prisma db push --accept-data-loss` en cada una. Es **idempotente** (tablas nuevas = seguro). Vía fiable: `railway ssh --service crm-mt node scripts/migrate-all-tenants.cjs`.

## Aprovisionar un cliente

`scripts/provision-tenant.cjs <slug>`: (1) `CREATE DATABASE tenant_<slug>` si no existe (el slug se sanea a `[a-z0-9-]`, el nombre de BD **no** se puede parametrizar en SQL, de ahí el saneo), (2) `db push` del esquema CRM, (3) siembra el admin del club. En producción el alta la dispara el webhook por-plan de la tienda (ver [[Alta automática por webhook]]); las credenciales del admin llegan **por env** (`TENANT_ADMIN_EMAIL/PASSWORD`), no por argv.

## Tareas programadas (cron)

Endpoints `/api/jobs/*`, protegidos con **`Authorization: Bearer <CRON_SECRET>`** vía `requireCronAuth` (`src/lib/cron-auth.ts`). Diseño **fail-closed**: si no hay secreto configurado responde `503` (antes el patrón `if (secret && ...)` dejaba el endpoint **público**, permitiendo disparar facturación y envío masivo); comparación de **tiempo constante** con `timingSafeEqual`. Detalle en [[Auditoría de seguridad]]. Acepta `CRON_SECRET` o `BILLING_CRON_SECRET`.

- **Jobs de CRM (`crm-mt`)** — recorren todos los clubes con `forEachTenant` (activa la BD del club antes de cada consulta Prisma): `billing`, `billing-cycle` (ver [[Facturación y cuotas]]), `attendance-forms` (ver [[Eventos y asistencia]]), `document-expiring`.
- **Jobs del portal (`portal`)** — operan sobre la BD del portal y están gateados por `isPortalCentralHost()`: `trial-suspend` (suspende clubes con `trialEndsAt` vencido).

## Disciplina previa al deploy

Verificación **adversarial** antes de cada push: `tsc` (typecheck) + `next build` (recuerda `AGENTS.md`: este Next.js trae cambios de ruptura; lee `node_modules/next/dist/docs/` antes de tocar APIs) y una revisión crítica del propio cambio. `npm run build` corre `prisma generate && next build`. Hay un guard de seguridad, `npm run security:sql` (`check-no-raw-sql.cjs`), que **falla el build** si detecta `$queryRawUnsafe`, `$executeRawUnsafe` o SQL concatenado por template literal en `src/`|`prisma/`.

## Convenciones de código

- **Nada de raw SQL inseguro**: siempre Prisma parametrizado; el único SQL crudo tolerado es `CREATE DATABASE` con nombre saneado en los scripts de aprovisionamiento.
- **`@ts-nocheck`** puntual en `src/components/portal/PortalLoginForm.tsx` (cliente); evítalo en el resto.
- **Aprovisionar por env, no por argv** en producción.
- **Modelo C first**: los server-to-server ya autorizados (p. ej. `members-service.ts`) viven fuera de ficheros `'use server'` para no exponerse como RPC — ver [[Server actions y seguridad]].

## Variables de entorno

**Multi-tenant / resolución de tenant** (ver [[Resolución de tenant]]):
- `MULTITENANT` — master switch del modo MT (`crm-mt`).
- `TENANT_BASE_DOMAIN` — dominio raíz; `slug.<dominio>` → tenant, el raíz = portal.
- `TENANT_DB_BASE_URL` — URL del Postgres compartido; se le cambia solo el nombre de BD a `tenant_<slug>` (`TENANT_DB_PREFIX`, por defecto `tenant_`).
- `MT_APP_URL` — URL pública de `crm-mt` para SSO **sin dominio** aún (usa `?tenant=` override).
- `TENANT_STRICT` (def. `true`) — sin tenant activo, la operación de BD **falla** en vez de caer a una BD por defecto; garantiza el [[Aislamiento entre clubes]].
- `TENANT_ALLOW_OVERRIDE` — permite forzar tenant por cookie/query `?tenant=` (solo pruebas sin dominio; **apagar** en producción con wildcard).

**Portal** (ver [[Panel de administración del portal]]):
- `PORTAL_CENTRAL_HOST=true` — marca el servicio como portal.
- `PORTAL_TENANT_MODE=true` — login contra el directorio Tenant/PortalUser + redirect por subdominio.
- `PORTAL_ADMIN_PASSWORD` — contraseña del super-admin (`/furvoley-config`).
- `PORTAL_SSO_SECRET` — firma los tokens SSO portal→CRM; sirve de fallback de `NEXTAUTH_SECRET` y de secreto de sesión admin.

**Auth y sesiones** (ver [[Autenticación y sesiones]]):
- `NEXTAUTH_SECRET` — secreto de sesión NextAuth de los CRM.
- `MEMBER_DEFAULT_PASSWORD` — contraseña inicial de socios recién creados (def. `12345678`; **cámbiala**).

**Cron**: `CRON_SECRET` (Bearer de `/api/jobs/*`; alias `BILLING_CRON_SECRET`).

**SMTP** (correo de bienvenida de las altas; poner en el servicio **`portal`**, ver `.env.smtp.example`): `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS / 465 TLS), `SMTP_SECURE` (`false` con 587, `true` con 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

**Webhook de alta** (semáforos en memoria contra un token filtrado; cada alta lanza aprovisionamiento pesado): `WEBHOOK_RATE_MAX` (def. 30 por ventana y token), `WEBHOOK_RATE_WINDOW_MS` (def. 60000), `WEBHOOK_MAX_CONCURRENT` (def. 3, semáforo global). Responde 429/503 con `Retry-After` y la tienda reintenta.

**API pública deportiva**: `PUBLIC_SPORTS_API_KEY` — si está definida, exige `Bearer`/`X-API-Key`; si no, la API queda abierta (solo lectura de eventos públicos).

## Relacionado

- [[Arquitectura Modelo C]]
- [[Resolución de tenant]]
- [[Alta automática por webhook]]
- [[Auditoría de seguridad]]
- [[Panel de administración del portal]]
- [[Facturación y cuotas]]
