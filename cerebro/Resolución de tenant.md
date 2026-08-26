---
tags: [multitenant, tenant-resolution, middleware, async-local-storage, nextjs, seguridad, modelo-c]
---

# Resolución de tenant

## Qué resuelve y por qué

En [[Arquitectura Modelo C]] cada club vive en su propio subdominio (`slug.tudominio.com`) con su **propia BD** (`tenant_<slug>`). Cada petición tiene que decidir **a qué BD apunta** antes de tocar Prisma. El "tenant activo" no se pasa por parámetro: se propaga con **AsyncLocalStorage** (`als`) y el proxy `@/lib/prisma` lee `currentTenant()` para elegir el cliente. Ficheros clave: `src/middleware.ts`, `src/lib/multitenant/request.ts`, `context.ts`, `registry.ts`.

El principio de seguridad central: **el slug se deriva SIEMPRE del host, nunca de una cabecera/cookie/query que envíe el cliente** (salvo en modo pruebas). Si se confiara en el cliente, cualquiera podría leer o autenticarse contra la BD de otro club. Ver [[Aislamiento entre clubes]].

## El flujo en el borde: middleware fija `x-tenant-slug`

`src/middleware.ts` → `tenantHeaders(req)` es el punto autoritativo:

- **Borra** cualquier `x-tenant-slug` entrante (`fwd.delete("x-tenant-slug")`) para que nadie lo inyecte.
- Calcula el slug con `tenantSlugFromHost(host)` y, si lo hay, lo re-**escribe** en las cabeceras que reenvía al handler (`fwd.set("x-tenant-slug", slug)`).
- Solo con **`TENANT_ALLOW_OVERRIDE=true`** (modo pruebas, sin dominio comodín) acepta override explícito: `?tenant=`, cabecera `x-tenant-override` o cookie `furvoley-tenant`. En producción esto está apagado → **solo cuenta el subdominio**. El override por `?tenant=` se recuerda en cookie `furvoley-tenant` para que los fetch siguientes (que ya no llevan el query) mantengan el club.

Por tanto, cualquier ruta cubierta por el `matcher` del middleware llega al handler con un `x-tenant-slug` **fiable**. El `matcher` excluye `login`, `join`, `api/auth`, estáticos y favicons — esos caminos resuelven el tenant por su cuenta (ver abajo).

## Cómo se calcula el slug: `registry.ts`

- `tenantSlugFromHost(host)`: toma el primer label del subdominio. Con `TENANT_BASE_DOMAIN` configurado, el dominio raíz devuelve `null` (= portal, no un tenant) y solo `*.base` produce slug. Sin base, solo hay tenant si el host tiene ≥3 labels.
- `sanitizeSlug()`: normaliza a `[a-z0-9-]`, recorta a 48 chars y **rechaza subdominios reservados** (`www`, `app`, `portal`, `acceso`, `login`, `admin`, `api`, `static`, `assets`) devolviendo `null`.
- `tenantDbName(slug)` = `tenant_<slug>` (guiones → `_`, no reversible); `tenantDbUrl(slug)` deriva la URL cambiando solo el path de `TENANT_DB_BASE_URL`.

## Activar el tenant en el handler: `enterWith` vs `als.run`

`context.ts` expone dos formas de meter el contexto en el `AsyncLocalStorage`, y **la diferencia es el gotcha más importante**:

- **`enterTenant()` → `als.enterWith(ctx)`**: activa el tenant para el resto de la ejecución async **actual**, sin envolver un callback. **Solo alcanza al código que espera (`await`) DESPUÉS y de forma SÍNCRONA antes del primer `await`.** Si se llama tras un `await`, la activación puede no propagarse a las consultas posteriores.
- **`withTenant(ctx, fn)` → `als.run(ctx, fn)`**: envuelve `fn` y propaga el tenant a **todos** los awaits de dentro. Fiable siempre, pero necesita un callback que envolver.

### `enterTenantFromRequest(request)` — API routes
`request.ts`. Lee `x-tenant-slug` de `request.headers` (**síncrono**) y llama a `enterTenant` (`enterWith`). Por eso los handlers que usan `requireRoles([...])` **deben pasar `request`**: `requireRoles` (en `rbac-api.ts`) hace `await enterTenantFromRequest(request)` como primerísima línea, antes de leer sesión o consultar Prisma. Ver [[RBAC y módulos]] y [[Autenticación y sesiones]].

### `runWithTenant(fn)` — RSC, páginas y server actions
`request.ts`. Envuelve el render/acción con `als.run` vía `withTenant`, así que es lo correcto cuando hay awaits de por medio (páginas de servidor y cada server action). Internamente resuelve el contexto con **`resolveTenantCtx()`**, que lee de `headers()`/`cookies()` **por HOST** (no del `x-tenant-slug` inyectado): rutas excluidas del middleware, como `/join` o formularios públicos, no depuran la cabecera del cliente, así que aquí se ignora salvo en `TENANT_ALLOW_OVERRIDE`. Muchos server actions (`src/app/actions.ts`, `src/actions/events.ts`, etc.) hacen `return runWithTenant(async () => { ... })`. Ver [[Server actions y seguridad]].

### `enterTenantFromHeaders(headers)` — login por credenciales
`request.ts`, usado en el `authorize` de NextAuth (`src/lib/auth.ts`). `/api/auth` **no pasa por el middleware**, así que aquí el tenant se resuelve **por host** de forma síncrona (antes del primer `await`, para que `enterWith` alcance las consultas de credenciales). El orden es: solo con `TENANT_ALLOW_OVERRIDE` mira `x-tenant-slug`/cookie; en producción va directo a `tenantSlugFromHost(host)`. Sin esto, el login por credenciales no sabría a qué BD mirar y un atacante podría autenticarse contra otro club. Ver [[Autenticación y sesiones]].

## `TENANT_STRICT`: fallar en vez de fugar

`registry.ts` → `tenantStrict()` (por defecto **true**). En `prisma.ts`, `resolveClient()`:
- Si hay tenant activo → cliente de esa BD (caché LRU por URL).
- Si **no** hay tenant y `MULTITENANT=true` y `TENANT_STRICT` → **lanza error** en vez de caer a `DATABASE_URL`. Esto evita que una operación sin contexto lea/escriba en una BD por defecto (fuga entre clubes).
- Sin `MULTITENANT` (modo un-solo-club) usa `DATABASE_URL` sin cambios.

Consecuencia práctica: **una consulta Prisma que no esté envuelta en `requireRoles`/`runWithTenant`/`withTenant` revienta** en multi-tenant. Para tareas de fondo (cron) que recorren clubes se usa `forEachTenant()` (`dispatch.ts`), que hace `withTenant({slug,dbUrl}, ...)` por cada tenant ACTIVE del directorio del portal.

## Variables de entorno (resumen)

- **`MULTITENANT`** — enciende todo el enrutado por tenant; apagado = un-solo-club.
- **`TENANT_STRICT`** (def. `true`) — sin tenant activo, fallar en vez de usar la BD por defecto.
- **`TENANT_ALLOW_OVERRIDE`** (def. `false`) — SOLO pruebas: permite forzar tenant por `?tenant=`, cabecera o cookie. **Nunca en producción.**
- **`TENANT_BASE_DOMAIN`**, **`TENANT_DB_BASE_URL`**, **`TENANT_DB_PREFIX`** (`tenant_`) — parsing de subdominio y derivación de la URL de BD.

Detalle de despliegue y flags en [[Operaciones, entorno y convenciones]].

## Relacionado

- [[Arquitectura Modelo C]]
- [[Aislamiento entre clubes]]
- [[Autenticación y sesiones]]
- [[Server actions y seguridad]]
- [[RBAC y módulos]]
- [[Operaciones, entorno y convenciones]]
