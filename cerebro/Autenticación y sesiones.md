---
tags: [autenticacion, sesiones, nextauth, jwt, sso, multitenant, seguridad]
---

# Autenticación y sesiones

## Panorama
Hay **cuatro superficies de sesión** que conviven, todas verificadas contra el club activo:
1. **NextAuth Credentials** (cookie JWT) — login directo en el CRM del club (`club.dominio.com/login`).
2. **Cookie de sesión emitida por SSO** — cuando entras desde el portal central (misma cookie NextAuth, pero minteada a mano).
3. **Bearer JWT** — app móvil (`Authorization: Bearer …`).
4. **Sesión HMAC del super-admin del portal** — cookie propia, ajena a NextAuth, solo en el servicio portal.

Las 1-3 llevan el **claim `tenant`** y pasan por el mismo punto de verdad (`sessionMatchesActiveTenant`). La 4 es un mundo aparte. Ver [[Arquitectura Modelo C]] para los dos servicios (crm-mt y portal).

## NextAuth Credentials por-tenant (`src/lib/auth.ts`)
- **Estrategia `jwt`** (no sesiones en BD). `PrismaAdapter` presente pero la sesión vive en el JWT.
- En `authorize()` lo **primero y síncrono** es `enterTenantFromHeaders(req.headers)`: activa la BD del club **antes del primer `await`**. Es obligatorio porque `/api/auth/*` **no pasa por el middleware**, así que el tenant se resuelve **solo por host** — nunca por `x-tenant-slug` ni cookie del cliente (salvo `TENANT_ALLOW_OVERRIDE` en pruebas). Ver [[Resolución de tenant]] para el gotcha de `enterWith` vs `als.run`.
- **Env-admin fijo**: `ADMIN_EMAIL`/`ADMIN_PASSWORD` siempre válidos (se sincronizan a un `User` real con `syncEnvAdminUser`).
- **Anti fuerza bruta** por `IP+email` (`login-rate-limit`), y `bcrypt.compare` para el resto.
- **Gate de club suspendido** (`assertNotSuspended`): se consulta **solo tras validar credenciales**, para que un anónimo no dispare lecturas a la BD del portal ni enumere clubes.
- **Cookie determinista por entorno**: `useSecureCookies` en producción emite `__Secure-next-auth.session-token` — el **mismo nombre** que usa el SSO (`buildPortalSessionCookie`), porque `NEXTAUTH_URL` varía por host y no sirve de discriminante.

### El claim `tenant`
`authorize` devuelve `tenant: currentTenant()?.slug`. El callback `jwt` lo copia al token; el callback `session` lo expone en `session.user.tenant`. Tipado en `src/types/next-auth.d.ts` (`Session.user`, `User`, `JWT`). El callback `jwt` también **refresca** `mustChangePassword`/`role`/`memberId` desde la BD cuando el cliente llama a `update()` (p. ej. tras cambiar contraseña).

## El punto único: `sessionMatchesActiveTenant` (`src/lib/tenant-session.ts`)
Responde a "**¿esta sesión pertenece al club activo (por host)?**":
- Si hay claim `tenant` → debe **coincidir exactamente** con el slug activo.
- **Token heredado sin claim** → se acepta solo si el `user.id` existe en la BD del club activo (los ids son globalmente únicos, así que un id de otro club no aparece). **Fail-closed** ante error de BD.
- Sin tenant activo (servicio portal / single-tenant) → no aplica, devuelve `true`.

Es el **único punto de verdad**, invocado desde tres sitios: el callback `session` (`auth.ts`, borra `session.user` si no cuadra), la rama Bearer (`session.ts`) y `requireRoles` (`rbac-api.ts` vía `getSessionFromRequest`). Por eso protege incluso las rutas **self-auth** que no pasan por `requireRoles` (workflows, whatsapp, [[Server actions y seguridad]]). Es la última línea de [[Aislamiento entre clubes]]: una cookie/Bearer de otro club reenviada a este host se rechaza.

## Lectura de sesión (`src/lib/session.ts`)
- `getSafeServerSession()` — envuelve `getServerSession`; si el JWT no descifra (secret cambiado, cookie de otro deploy) devuelve `null` en vez de un 500. Normaliza a `null` cuando el callback `session` ya vació `user`.
- `getSessionFromRequest(request)` — **Bearer móvil primero**: si hay `Authorization: Bearer`, hace `decode()` con el secret, arma una `Session` desde el payload y la valida con `sessionMatchesActiveTenant`. Si no hay Bearer, cae a la cookie. Es el punto de entrada de [[RBAC y módulos]] (`requireRoles`).

## SSO del portal e impersonación (`src/lib/portal-sso.ts`, `/api/portal/sso`)
El SSO es un **token HMAC corto** (no un JWT NextAuth):
- **Formato**: `base64url(payload).HMAC-SHA256`, firmado con `PORTAL_SSO_SECRET`. **TTL 60 s**, `iss: 'furvoley-portal'`, y **claim `tenant`** que **liga el token a un club**.
- `createPortalSsoToken(user, secret, tenantSlug)` → `parsePortalSsoToken` valida firma (`timingSafeEqual`), `iss` y `exp`. `ssoTokenMatchesTenant` exige que el claim coincida con el subdominio resuelto (tokens antiguos sin claim se toleran por el TTL de 60 s).
- **Consumo** en `/api/portal/sso` (GET): activa el tenant (`enterTenantFromRequest`), comprueba el binding, materializa el `User` local **just-in-time** (`sso-jit.ts` — crea el usuario con contraseña aleatoria porque el acceso va por SSO) y **emite la cookie de sesión NextAuth** con `buildPortalSessionCookie` (propaga el claim `tenant`). Redirige a `/change-password` o `/`.

**Login por host desde el portal** (`/api/portal-central/login`): autentica contra el **directorio del portal** (`verifyPortalUser`), mintea el token SSO ligado al slug y devuelve `redirectUrl` al subdominio del club. Así el usuario entra en `/portal`, no en cada CRM. Ver [[Panel de administración del portal]] y [[Alta automática por webhook]].

**"Entrar como" / impersonación** (`/api/portal-central/admin/impersonate`): reutiliza el mismo SSO — el secreto vive en el portal — pero **sin contraseña**, con la identidad del `PortalUser` ADMIN activo del club. **Funciona con el club suspendido** (soporte debe poder entrar a arreglar) y queda **auditado** (`IMPERSONATE`).

## Bearer móvil
`/api/portal/mobile/exchange` (POST) canjea un token SSO (ligado al club, verificado con `ssoTokenMatchesTenant`) por un **access token de 30 días** (`issueMobileAccessToken` → `encode` NextAuth con el claim `tenant`). Ese token viaja luego como `Authorization: Bearer` y se valida en cada petición como se describe arriba.

## Sesión del super-admin del portal (`src/lib/portal-central/admin-auth.ts`)
Sistema **independiente de NextAuth**, cookie `portal-admin-session`:
- **Token HMAC autocontenido** (`body.sig`, secret = `PORTAL_SSO_SECRET || PORTAL_ADMIN_PASSWORD`), **TTL 12 h**, con `iat` para permitir revocación.
- **Dos identidades**: `sub='master'` (contraseña maestra de entorno `PORTAL_ADMIN_PASSWORD`, nunca desaparece) o `sub=<email>` (super-admin nombrado en `PortalAdmin`).
- **Revocación de cookies ya emitidas** (el HMAC no se puede invalidar por sí solo): en `isSessionSubjectActive` el super-admin nombrado solo sigue válido si su `PortalAdmin.status === 'ACTIVE'` **y** el `iat` es posterior a `sessionsInvalidBefore` (corte que se avanza al resetear su contraseña). **Fail-closed** si falla la BD. El `master` no depende de BD.
- `verifyPortalAdminPassword` compara en tiempo constante. Login en `/api/portal-central/admin/login` (con rate-limit); GET devuelve `{ authenticated, identity }`.

## Gotchas
- **El tenant se resuelve por HOST en el login**, no por header — `/api/auth` y las rutas excluidas del middleware no depuran `x-tenant-slug`; confiar en él permitiría autenticarse contra la BD de otro club.
- **Un mismo nombre de cookie** para NextAuth y SSO es intencional: evita que dependa de `NEXTAUTH_URL`.
- **TTL asimétricos**: SSO 60 s (un solo salto), sesión/Bearer 30 días, super-admin 12 h.
- **Tokens sin claim `tenant`** (previos a la protección) se aceptan con fallback; el binding es infalsificable porque el token va firmado.

## Relacionado
- [[Resolución de tenant]]
- [[Aislamiento entre clubes]]
- [[RBAC y módulos]]
- [[Panel de administración del portal]]
- [[Arquitectura Modelo C]]
- [[Auditoría de seguridad]]

## El token SSO va atado a un club, y sin atar no vale

`createPortalSsoToken(user, secret, tenantSlug)` mete el slug en el claim `tenant`, y `/api/portal/sso` rechaza el token si el subdominio no coincide (`ssoTokenMatchesTenant`).

**Los cuatro emisores tienen que pasar el slug.** Durante un tiempo dos de ellos —los del login heredado por lista de entorno— no lo pasaban, y `ssoTokenMatchesTenant` devolvía `true` para los tokens sin claim «por compatibilidad»: un token emitido para el club A se canjeaba en el subdominio del club B con la identidad de A. Hoy un token sin atar **no vale**, y la lista de entorno deduce el slug del subdominio de su propia URL pública.

En producción manda `PORTAL_TENANT_MODE=true`, que usa el registro en base de datos y siempre ató el slug; el agujero estaba en los demás despliegues.

## Impersonación: la sesión va marcada

El token de impersonación lleva `imp: true`, `jitTenantUserSession` lo arrastra y acaba en `session.user.impersonated`. Sin esa marca, dentro del CRM una impersonación es **indistinguible** de la sesión real del admin del club. Se usa para no registrar en el club las consultas del proveedor (ver [[Pasarela de cobro (Whop)]]); si la marca se pierde en cualquier eslabón, esas consultas se registran como si fueran del club.
