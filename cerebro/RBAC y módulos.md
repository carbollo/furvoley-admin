---
tags: [rbac, roles, modulos, feature-flags, autorizacion, crm, multi-tenant, seguridad]
---

# RBAC y módulos

Dos capas de autorización **independientes y acumulativas** protegen cada superficie del CRM de un club:

1. **RBAC por rol** — *quién* eres (ADMIN/COACH/TREASURER/MEMBER) decide qué **secciones** puedes ver/tocar.
2. **Módulos (feature flags por club)** — *qué plan* tiene el club decide qué **pestañas** existen, independientemente del rol.

Una petición debe superar **ambas**. Cada capa se aplica en cliente (ocultar UI) **y** en servidor (401/403), como defensa en profundidad. Ver también [[Autenticación y sesiones]] y [[Planes y facturación del portal]].

## Roles y secciones (`src/lib/rbac.ts`)

- `APP_ROLES = ['ADMIN','COACH','TREASURER','MEMBER']`. El rol legado **`PLAYER` se normaliza a `MEMBER`** (`normalizeRole`), que también hace de *fallback* ante cualquier valor desconocido — nunca devuelve nulo.
- `ROLE_LABEL` mapea a etiquetas en español (Administrador, Entrenador, Tesorero, Socio).
- **`CrmSectionId`** enumera todas las secciones del CRM (dashboard, socios, cuotas, contabilidad, calendario, informes, workflows, whatsapp, hermes, personal, entrenamiento, y las del roadmap: admin-sumario, organigrama, contactos, asistencia, facturas, impagos, productos, descuentos, forms, api).
- **`CRM_SECTIONS_BY_ROLE`** es la matriz rol→secciones permitidas:
  - **ADMIN**: todo.
  - **COACH**: solo `calendario`, `asistencia`, `entrenamiento`.
  - **TREASURER**: `cuotas`, `contabilidad`, `facturas`, `informes`, `impagos`, `productos`, `descuentos`.
  - **MEMBER**: **`[]` (ninguna)** — un socio no entra al CRM web; usa la app móvil (`/api/mobile/*`).
- Helpers puros: `hasRole(role, allowed[])`, `canAccessCrmSection(role, section)`, `getAllowedCrmSections(role)`.

## Gate de RBAC en la API (`src/lib/rbac-api.ts`)

`requireRoles(allowed, request)` es el guardián estándar de casi todas las rutas `/api/crm/*`. En orden:

1. **`enterTenantFromRequest(request)`** — activa la BD del tenant antes de cualquier consulta Prisma (ver [[Resolución de tenant]]).
2. `getSessionRole(request)` lee la sesión (Bearer vía `getSessionFromRequest`, o cookie vía `getServerSession`). Confía en que el enlace **sesión↔tenant activo** ya está aplicado en el callback `session` de `auth.ts` y en la ruta Bearer: si la sesión no pertenece al club activo, llega **sin `user`**.
3. Si no hay `user`, o el rol no está en `allowed` → **`401`**.
4. **`assertModuleForRequest(request)`** — aplica el gate de módulos (abajo). Módulo desactivado → **`403`**.
5. Devuelve `{ ok: true, session, role }` para el handler.

**`assertTeamAccess(auth, groupId)`** afina el RBAC a nivel de recurso: un COACH solo puede **mutar** equipos que entrena (busca `GroupMembership { groupId, memberId, role: COACH }`); ADMIN, cualquiera. Cierra el hueco por el que exigir solo rol COACH dejaba tocar plantillas de equipos ajenos. Relevante en [[Eventos y asistencia]].

## Módulos: cada pestaña es activable por club (`src/lib/crm-modules.ts`)

El super-admin activa/desactiva **módulos** por club desde el [[Panel de administración del portal]]. Conceptos clave:

- **`CrmModuleId`**: `inicio | calendario | entrenamiento | whatsapp | socios | admin | contabilidad | workflows | hermes`.
- **`CRM_MODULES`** define, en orden del menú lateral, cada módulo con su `label` y las **secciones que agrupa** (p.ej. `contabilidad` engloba contabilidad, facturas, cuotas, impagos, productos, descuentos, informes; `admin` engloba admin-sumario, organigrama, contactos, asistencia, personal).
- **`features` (`Tenant.features`)** es un mapa `moduleId → boolean`. **Regla de oro: ausente = activado.** Solo se persisten las *desactivaciones*, así que `{}` significa "todo activo" (comportamiento por defecto).
- **Secciones "core"**: una sección que **no** pertenece a ningún módulo (no aparece en `CRM_MODULES`) está **siempre** visible, no se puede desactivar.

Funciones:
- `isModuleEnabled(module, features)` → `features?.[module] !== false` (robusto ante `null`).
- `isSectionEnabled(section, features)` → busca el módulo de la sección; **core → true**, si no, el flag del módulo.
- `sanitizeFeatures(input)` → normaliza cualquier objeto de BD/red a un `TenantFeatures` válido (solo booleanos de módulos conocidos), defensa ante datos sucios.

**Gotcha**: `inicio` (Panel) también es un módulo desactivable por petición; si se apaga, el CRM abre en la siguiente pestaña disponible en vez de fallar.

## Gate de módulos en servidor (solo módulos AISLADOS)

`assertModuleForRequest(request)` infiere el módulo del **prefijo de URL** (`MODULE_ROUTE_PREFIXES`) y devuelve `403` si está desactivado en el tenant:

- `/api/crm/training` → `entrenamiento`
- `/api/crm/workflows` → `workflows`
- `/api/crm/whatsapp` **y** `/api/crm/chat` → `whatsapp`
- `/api/crm/accounting` → `contabilidad`
- `/api/hermes` → `hermes`

Detalles críticos:
- **Solo se gatean módulos aislados.** Se **excluyen a propósito** `/api/crm/invoices`, `/products` y `/discounts`: aunque pertenecen al módulo `contabilidad`, el **flujo CORE** de cuotas/socios los comparte (p.ej. marcar una cuota pagada vía `/api/crm/invoices/:id/mark-paid`), y no debe acoplarse al plan. Ver [[Facturación y cuotas]] y [[Contabilidad]].
- **`workflows` y `whatsapp` autentican por su cuenta** (`getServerSession` directo en vez de `requireRoles`), así que llaman a `assertModuleForRequest` a mano. **Las nueve rutas `/api/hermes/*` de la interfaz NO**: usan `requireRoles(['ADMIN'], request)` y heredan el gate de módulo como el resto.
- **La excepción real es `/api/hermes/mcp`**, que se autentica con su propio Bearer y no pasa por `assertModuleForRequest`. Durante un tiempo tampoco activaba el club, así que en multi-tenant estaba sencillamente muerta: la primera consulta reventaba. Hoy resuelve el club por el subdominio o por la cabecera `x-hermes-club` que pone el gateway.
- **Fail-open**: si no se pueden leer los flags, **no se bloquea nada** (disponibilidad > restricción).

## De dónde salen los flags (`src/lib/tenant-features.ts`)

`getTenantFeatures(slug)` lee `Tenant.features` de la **BD del PORTAL**, no de la del club. En `crm-mt` el proxy `@/lib/prisma` apunta a la BD del tenant (y lanza fuera de tenant), así que se usa un **`pg.Client` directo** contra la BD central (`PORTAL_DB_NAME`), con **caché TTL 30 s** (un cambio de plan tarda como mucho el TTL en propagarse). En modo un-solo-club (`!isMultiTenant()`) devuelve `{}` → **todo activado**. Este cruce portal↔club es coherente con [[Aislamiento entre clubes]].

## Aplicación en el cliente (`src/components/crm/CrmApp.tsx`)

El sidebar combina ambas capas: `canShow(id) = canAccessCrmSection(role, id) && isSectionEnabled(id, features)`. La sección que falle **desaparece del menú**. `firstAllowed` = primera sección visible (fallback `dashboard`); si la pestaña activa deja de estar permitida, redirige a `firstAllowed`. El `features` del bundle viene de `/api/crm/data`. Es solo UX: el servidor sigue devolviendo 401/403 aunque se manipule el cliente (ver [[Server actions y seguridad]]).

## Relacionado

- [[Autenticación y sesiones]]
- [[Planes y facturación del portal]]
- [[Panel de administración del portal]]
- [[Resolución de tenant]]
- [[Server actions y seguridad]]
- [[Motor de workflows]]
