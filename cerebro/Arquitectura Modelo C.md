---
tags: [arquitectura, multi-tenant, modelo-c, railway, prisma, postgres, infraestructura]
---

# Arquitectura Modelo C

## Qué es el "Modelo C"

**Una sola aplicación (un único repo/imagen) que sirve a muchos clubes, con aislamiento de datos a nivel de base de datos completa.** No hay una BD gigante compartida con columna `tenant_id` (eso sería "Modelo A/B"); en su lugar:

- **1 servidor Postgres compartido** aloja **N bases de datos independientes**, una por club: `tenant_<slug>` (p. ej. `tenant_mi_club`).
- **1 base de datos aparte para el portal** (por defecto `portal`), con el directorio autoritativo de clubes (tabla `Tenant`) y los usuarios del portal (`PortalUser`).
- El **mismo `schema.prisma`** describe tanto el esquema del CRM de cada club como las tablas del portal (que quedan inertes en las BD de club y viceversa).

El beneficio es aislamiento fuerte y barato: un club nunca puede leer datos de otro porque físicamente están en otra BD. El coste es que **los cambios de esquema hay que aplicarlos a cada BD** (ver Operaciones). Ver también [[Aislamiento entre clubes]].

## Los 2 servicios Railway

Ambos servicios corren **el mismo código/imagen desde la misma rama**; se diferencian **solo por variables de entorno**:

- **`crm-mt`** — el CRM que usan los clubes. Env clave: `MULTITENANT=true`, `TENANT_STRICT=true`, y mientras no haya dominio comodín `TENANT_ALLOW_OVERRIDE=true`. Resuelve el tenant por subdominio (`club.dominio.com`) y enruta cada petición a la BD `tenant_<slug>` correspondiente.
- **`portal`** — el panel central de gestión + login central. Env clave: `PORTAL_CENTRAL_HOST=true` y `PORTAL_TENANT_MODE=true`; usa `DATABASE_URL` apuntando a **su propia BD `portal`**. Ver [[Panel de administración del portal]] y [[Planes y facturación del portal]].

Ambos apuntan al **mismo servidor Postgres compartido**: el `portal` a su BD `portal`, y `crm-mt` a las `tenant_<slug>` (derivadas de `TENANT_DB_BASE_URL`).

## El proxy Prisma y el enrutado por tenant

El corazón del modelo está en `src/lib/prisma.ts`: **`prisma` no es un cliente, es un `Proxy`** que en cada acceso resuelve el cliente correcto:

- Lee el tenant activo del contexto (`currentTenant()` desde `AsyncLocalStorage`, en `src/lib/multitenant/context.ts`).
- Si hay tenant con `dbUrl`, usa/crea un `PrismaClient` para esa BD, cacheado en un **LRU acotado** (`TENANT_CLIENT_CACHE_MAX`, por defecto 25) — muchos clubes registrados, pocos "calientes" a la vez.
- **Sin tenant y con `MULTITENANT=true` + `TENANT_STRICT=true`, lanza excepción** en vez de caer a una BD por defecto. Esto es defensa en profundidad: prohíbe consultas "sin club" que podrían filtrar datos.
- En modo un-solo-club (`MULTITENANT` apagado) usa `DATABASE_URL` como siempre, sin cambios de comportamiento.

El cómo se pone el tenant en el contexto (subdominio → cabecera `x-tenant-slug` → `als.enterWith`/`als.run`) y su gotcha crítico están en [[Resolución de tenant]].

## Cómo encaja una petición

1. El **middleware** (`src/middleware.ts`) resuelve el slug **desde el host** de forma autoritativa (`tenantSlugFromHost`), **borra cualquier `x-tenant-slug` que envíe el cliente** y reinyecta el suyo. Es la barrera anti cross-tenant.
2. El handler activa el tenant en `AsyncLocalStorage` (API: síncrono desde `request`; RSC: `runWithTenant`; login NextAuth: `enterTenantFromHeaders`). Detalle en [[Resolución de tenant]] y [[Autenticación y sesiones]].
3. Cualquier `prisma.*` posterior queda enrutado a `tenant_<slug>` automáticamente, sin pasar el tenant por parámetro.

Para **tareas de fondo/cron** que deben recorrer todos los clubes existe `forEachTenant()` (`src/lib/multitenant/dispatch.ts`): lee los slugs `ACTIVE` de la tabla `Tenant` del portal y ejecuta el callback **una vez por club dentro de `withTenant(...)`**; un fallo en un club no interrumpe al resto. Se usa, p. ej., en jobs de suspensión de trials y en [[Alta automática por webhook]].

## Registry: derivación de nombres y URLs

`src/lib/multitenant/registry.ts` centraliza la aritmética de tenants:

- **`sanitizeSlug`** normaliza a `[a-z0-9-]` y **rechaza subdominios reservados** (`www`, `app`, `portal`, `admin`, `api`...): no son clubes.
- **`tenantDbName(slug)`** → `tenant_<slug>` (con guiones a `_`); prefijo configurable con `TENANT_DB_PREFIX`.
- **`tenantDbUrl(slug)`** deriva la URL de conexión tomando `TENANT_DB_BASE_URL` y **cambiando solo el path (nombre de BD)** — misma credencial/host, distinta base.
- **`tenantSlugFromHost(host)`** saca el slug del primer label del subdominio; con `TENANT_BASE_DOMAIN` fijado, el dominio raíz se trata como portal (no tenant).

Nota: `tenant_<slug>` **no es reversible** al slug (los guiones se vuelven `_`), por eso el directorio autoritativo de slugs es la tabla `Tenant` del portal, no el nombre de la BD.

## Arranque (scripts/start-*.cjs)

El `npm start` ejecuta `scripts/start-with-db-sync.cjs`, que **ramifica según el modo**:

- Si `PORTAL_CENTRAL_HOST=true` → delega en **`start-portal-central.cjs`**: si `PORTAL_TENANT_MODE=true` hace `prisma db push` contra la BD `portal` (crea Tenant/PortalUser en el primer deploy) y arranca `next start`.
- Si `MULTITENANT=true` → **omite `db push` y el bootstrap de admin** (no hay "una" BD que migrar aquí; cada BD de club se crea/migra al provisionar) y arranca `next start`.
- En modo un-solo-club → hace `ensureSchema()` (`db push` con reintentos) + `ensureAdminUser()` antes de arrancar.

Existe una variante `start-with-hermes.cjs` (idéntica pero además sincroniza la config de Hermes/MCP en un-solo-club; en MT también se omite, es por-tenant).

## Ciclo de vida de un club

- **Alta**: `scripts/provision-tenant.cjs <slug>` hace `CREATE DATABASE tenant_<slug>`, `prisma db push` sobre ella y siembra el admin del club. Se dispara desde el portal o vía [[Alta automática por webhook]].
- **Cambios de esquema**: como el arranque MT **no** hace `db push`, tras editar `schema.prisma` hay que correr `scripts/migrate-all-tenants.cjs` (enumera las `tenant_*` y hace `db push --accept-data-loss` en cada una). Detalle operativo en [[Operaciones, entorno y convenciones]].

## Gotchas

- **Nunca confíes en `x-tenant-slug` del cliente.** Solo el middleware lo fija (desde el host). Rutas fuera del middleware (`/api/auth`, `/join`, `/r/...`) resuelven el tenant **por host**; aceptar header/cookie del cliente solo ocurre en modo pruebas (`TENANT_ALLOW_OVERRIDE`).
- **`als.enterWith()` no cruza un `await`.** Es la trampa central del modelo; si se activa el tenant tras un await, las consultas no lo ven. Ver [[Resolución de tenant]].
- **`TENANT_STRICT=true` hace fallar** las consultas sin tenant en vez de leer de una BD por defecto: es intencional, no un bug.
- **Un mismo repo, dos comportamientos:** un despliegue mal configurado (env cruzadas) haría que `crm-mt` intente servir el portal o viceversa. Las env (`MULTITENANT`, `PORTAL_CENTRAL_HOST`, `PORTAL_TENANT_MODE`) son la única fuente de verdad del rol de cada servicio.

## Relacionado

- [[Resolución de tenant]]
- [[Aislamiento entre clubes]]
- [[Autenticación y sesiones]]
- [[Panel de administración del portal]]
- [[Alta automática por webhook]]
- [[Operaciones, entorno y convenciones]]
