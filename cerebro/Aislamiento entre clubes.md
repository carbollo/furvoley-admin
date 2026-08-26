---
tags: [aislamiento, cross-tenant, seguridad, multitenant, jwt, sesiones]
---

# Aislamiento entre clubes

## Qué es
En [[Arquitectura Modelo C]] una **misma app** sirve a todos los clubes y cada club tiene su **propia BD** (`tenant_<slug>`). El tenant activo se resuelve por host y se propaga con `AsyncLocalStorage` (ver [[Resolución de tenant]]). El riesgo estructural es el **cross-tenant**: que una credencial, sesión o token de un club acabe operando contra la BD de otro. Esta nota documenta los **dos fallos críticos** que existían y su fix, hoy el punto de referencia del aislamiento.

## C1 — El login confiaba en `x-tenant-slug` del cliente
**El bug:** `/api/auth` **no pasa por el middleware** (que es quien depura/fija `x-tenant-slug` de forma autoritativa desde el subdominio). El `authorize` de NextAuth leía ese header tal cual, así que un atacante podía apuntar `x-tenant-slug` (o la cookie `furvoley-tenant`) a **otro club** y **autenticarse contra la BD de ese club** desde cualquier host.

**El fix — login por host** (`multitenant/request.ts`, `enterTenantFromHeaders`): en el login el tenant se resuelve **solo por el `host`** (`tenantSlugFromHost`). El header/cookie del cliente **solo** se acepta en modo pruebas (`TENANT_ALLOW_OVERRIDE=true`). Detalles clave:
- Se llama **síncrona**, antes del primer `await`, porque `enterTenant` usa `als.enterWith` y este solo alcanza a las consultas posteriores si se ejecuta antes de romper la cadena async.
- `resolveTenantCtx` (para RSC) aplica la **misma regla por host**: rutas fuera del middleware (p. ej. `/join`) tampoco confían en el header del cliente.

## C2 — JWT sin tenant + secreto compartido
**El bug:** el JWT (estrategia `session: { strategy: "jwt" }`) **no llevaba** a qué club pertenecía, y las instancias comparten `NEXTAUTH_SECRET` y **nombre de cookie determinista** (`__Secure-next-auth.session-token`, igual que emite el SSO del portal). Consecuencia: una sesión emitida en `clubA.dominio.com` era un token **válido y descifrable** en `clubB.dominio.com` — reenviando la Cookie (o un Bearer) a otro host se operaba sobre la BD del otro club con el rol de la sesión original.

**El fix — claim `tenant` en el token:**
1. En `authorize` (`auth.ts`), el usuario devuelto lleva `tenant: currentTenant()?.slug` — el club (por host) al que queda **ligada la sesión**. Igual para el admin de entorno (`ADMIN_EMAIL`).
2. El callback `jwt` copia `token.tenant`; el callback `session` lo expone en `session.user.tenant`.
3. Verificación en el **punto único** (abajo): si el claim `tenant` no coincide con el tenant activo, la sesión no vale.

## El punto único: `sessionMatchesActiveTenant`
`src/lib/tenant-session.ts` es la **única fuente de verdad** del enlace sesión↔club. Lógica (fail-closed):
- **Sin tenant activo** (servicio portal / single-tenant) → `true` (no aplica).
- **Con claim `tenant`** → vale solo si `claim === activeSlug`. Un token de otro club **no coincide** → rechazado.
- **Sin claim** (tokens heredados de antes del despliegue) → se acepta solo si el `user.id` **existe en la BD del club activo**; como los ids son globalmente únicos, un id de otro club no existirá aquí. Error de BD → `false` (fail-closed).

Se invoca desde **tres superficies**, cerrando toda entrada:
- **Callback `session`** (`auth.ts`): si no casa, hace `delete session.user`, de modo que **toda** ruta con `getServerSession` la ve como no autenticada. `getSafeServerSession` (`session.ts`) lo normaliza a `null`.
- **Ruta Bearer** (`session.ts`, `getSessionFromRequest`): un Bearer JWT móvil de otro club se descifra pero se rechaza antes de devolver sesión.
- Y por herencia, **`requireRoles`** (`rbac-api.ts`): `getSessionRole` solo lee la sesión ya saneada, así que basta con eso.

**Por qué el punto único importa:** protege también las superficies **self-auth** que **no** pasan por `requireRoles` — `whatsapp/**`, `workflows/**` y las [[Server actions y seguridad]] — porque todas terminan leyendo `getServerSession`/`getSessionFromRequest`, ya interceptados. Ver [[Autenticación y sesiones]] para el flujo completo y [[RBAC y módulos]] para el gate de rol/plan que corre después.

## Gotchas
- **No confíes nunca en `x-tenant-slug` del cliente** fuera del middleware: en `/api/auth`, `/join` y RSC el tenant se resuelve **por host**.
- **`enterWith` es frágil:** debe ejecutarse **antes del primer `await`**. Para renders usa `runWithTenant` (`als.run`, propaga a través de awaits); para handlers, pasa `request` a `requireRoles`.
- **Fail-closed en tenant-session, fail-open en el gate de plan:** el aislamiento cross-tenant deniega ante la duda; el gate de módulos por plan (`assertModuleForRequest`) no bloquea si no puede leer flags. Son decisiones opuestas y deliberadas.
- El secreto y el nombre de cookie **compartidos** son intencionados (SSO del portal); por eso el aislamiento **no** puede apoyarse en criptografía distinta por club, sino en el **claim `tenant`**.

## Relacionado
- [[Arquitectura Modelo C]]
- [[Resolución de tenant]]
- [[Autenticación y sesiones]]
- [[RBAC y módulos]]
- [[Server actions y seguridad]]
- [[Auditoría de seguridad]]
