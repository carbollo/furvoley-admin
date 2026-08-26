---
tags: [portal-central, panel-admin, modelo-c, super-admin, aprovisionamiento, kpis, saas]
---

# Panel de administración del portal

Panel central del SaaS (multi-cliente) desde el que el operador de ProClubCRM da de alta clubes, gestiona sus planes y usuarios, y vigila la salud de toda la red. Es la superficie de gestión del servicio **portal** dentro de la [[Arquitectura Modelo C]]; vive aparte de los CRM de los clubes (crm-mt).

## Dónde vive y cómo se sirve

- **Ruta**: `/furvoley-config` (`src/app/furvoley-config/page.tsx`) renderiza el componente cliente `PortalAdminPanel`, exportado en `src/components/portal/PortalLoginForm.tsx`. Ese mismo fichero exporta también `PortalLoginForm`, que es el **login de socios/staff hacia el CRM** (superficie distinta, no confundir).
- **Solo en el servicio portal**: cada endpoint bajo `src/app/api/portal-central/admin/*` empieza por un gate `requireAdmin()` que exige `isPortalCentralHost()` (`PORTAL_CENTRAL_HOST=true`); en crm-mt devuelven **404**. Ahí `@/lib/prisma` apunta a la BD propia del portal (multitenant desactivado), no a la de ningún tenant — ver [[Aislamiento entre clubes]].
- Es una SPA de una sola página: tras autenticar, `useEffect` dispara en paralelo la carga de métricas, errores, auditoría, clubes, usuarios, planes, admins y estado SMTP.

## Autenticación del super-admin

Detalle completo en [[Autenticación y sesiones]]; lo esencial aquí:

- Cookie `portal-admin-session`, **token HMAC-SHA256 autocontenido** (`admin-auth.ts`), TTL 12 h. El secreto de firma es `PORTAL_SSO_SECRET || PORTAL_ADMIN_PASSWORD`.
- **Dos formas de entrar**:
  - **Contraseña maestra** (`PORTAL_ADMIN_PASSWORD`): login sin email, `sub='master'`, no depende de BD — fallback que nunca se elimina. Comparación con `timingSafeEqual`.
  - **Super-admins nombrados** (tabla `PortalAdmin`): email + contraseña. Pestaña **Admins** para crearlos/desactivarlos/resetear.
- **Revocación**: como el token es autocontenido no se puede invalidar por sí solo, así que en cada request se revalida contra BD para `sub != 'master'`: si el `PortalAdmin` no está `ACTIVE`, o si la sesión se emitió antes de `sessionsInvalidBefore` (marca que pone el reset de contraseña), se deniega. **Fail-closed**: si la consulta a BD falla, se rechaza.
- Login con **rate-limit** por IP; el resto de rutas exigen además `isPortalAdminConfigured()` (503 si falta `PORTAL_ADMIN_PASSWORD`).

## Las pestañas

- **Dashboard** — KPIs de negocio + actividad de socios.
  - **MRR / ARR / trials** vienen de `computePortalBilling()`: lectura **en vivo** de la tabla `Tenant` (suma de `priceMonthly` de los clubes `ACTIVE` que ya facturan; los que están en prueba se excluyen del MRR y se cuentan aparte). Ver [[Planes y facturación del portal]].
  - **Clubes / socios / ingresos / cobros pendientes** salen del último `PortalKpiSnapshot` + serie histórica (sparkline y barras por club). **El panel solo LEE**: el snapshot lo genera un **cron de crm-mt**, no se calcula aquí. Tolera que la tabla no exista aún (primer deploy).
  - **Reparto de beneficios** (divide el MRR con % y etiquetas editables, ver [[Planes y facturación del portal]]) y dos tarjetas de salud calculadas **en cliente** uniendo `clients` (con `memberLimit`) + `perClub` del snapshot: **Aprovechamiento de planes** (socios **totales** vs `memberLimit` → over-limit = subir de plan; infrautilizados <30%) y **Morosidad por club** (ranking por `membersOverdue/membersTotal` + `pendingAmount`). Nota: `perClub` del snapshot ya trae `membersOverdue/pendingAmount/pendingCount` por club.
- **Clubes** — el corazón del alta (ver siguiente sección) y, por club: badge de estado, chips de **etiquetas** (`Tenant.tags String[]`; la etiqueta `no-suspender` excluye del cron trial-suspend — case-insensitive, constante `NO_SUSPEND_TAG`), **Entrar como** (ahora pide **motivo** obligatorio → auditoría), **Actividad** (timeline: auditoría filtrada por `?tenantSlug=`), **Editar** (incluye **notas** internas `Tenant.notes` + etiquetas), **Reenviar acceso**, **Suspender/Reactivar**, selector de **Plan**, barra de socios vs. límite, y chips de **Módulos** (feature flags). El toggle de módulos guarda **solo desactivaciones** (ausente = activado) — mecánica compartida con [[RBAC y módulos]].
- **Planes** — CRUD de planes comerciales + estado **SMTP** + URL de webhook por plan → [[Planes y facturación del portal]] y [[Alta automática por webhook]].
- **Usuarios** — CRUD de `PortalUser` (usuarios de acceso al CRM de cada club): alta con rol (ADMIN/COACH/TREASURER/MEMBER), activar/desactivar. Contraseñas hasheadas con bcrypt.
- **Actividad** — registro de acciones sensibles (`PortalAuditLog`), con filtro por tipo de acción y **exportación a CSV** (cliente). Ver [[Auditoría de seguridad]].
- **Errores** — bandeja central de errores de servidor por club (`PortalErrorLog`, que **escribe crm-mt** y el panel solo lee), agrupados por tipo con contador; se pueden marcar como resueltos. Los conteos del resumen van sobre la tabla completa aunque solo se muestren 100 filas.
- **Admins** — gestión de los super-admins nombrados descritos arriba.

## Crear club = aprovisionar (el flujo crítico)

`POST /api/portal-central/admin/clients` orquesta el alta completa (Modelo C):

1. Valida que `slug` y `adminEmail` estén libres.
2. `createTenant()` → registra el `Tenant` en el **directorio del portal** (con tope de longitud en `name`).
3. `provisionTenant()` (`provision.ts`) **spawnea** `scripts/provision-tenant.cjs <slug>` → **CREATE DATABASE + `prisma db push` + seed del admin**. El email y la contraseña se pasan por **variables de entorno del hijo** (`TENANT_ADMIN_EMAIL/PASSWORD`), NUNCA por argv (los argumentos son visibles vía `ps`/`/proc` y los capturan los colectores de logs). Idempotente, timeout de 180 s.
4. `createPortalUser()` → crea el `PortalUser` **ADMIN** de acceso.
5. **Rollback**: si el aprovisionamiento falla, se borra el `Tenant` recién creado.

Es el mismo aprovisionamiento que dispara el flujo de [[Alta automática por webhook]].

## Otras acciones sobre un club

- **Entrar como** (`impersonate`): minta un **token SSO del portal** con la identidad del `PortalUser` ADMIN activo del club (sin contraseña) y abre su CRM en pestaña nueva. Reutiliza el secreto SSO del portal y liga el token al slug — misma mecánica de [[Resolución de tenant]] en el CRM destino. **Funciona incluso con el club SUSPENDIDO** (no pasa por el gate de login por credenciales): el soporte debe poder entrar a arreglar.
- **Suspender/Reactivar**: `Tenant.status`. Suspendido = sus usuarios no pueden entrar por credenciales y el club sale del dashboard/errores; el soporte sí puede entrar con "Entrar como".
- **Editar**: `name`, `priceMonthly` (clamp ≥ 0), `trialEndsAt`, `memberLimit`. El **slug es inmutable**.
- **Reenviar acceso**: genera una contraseña temporal (12 chars) para el admin del club, la devuelve **una sola vez** y NO toca la BD del tenant (solo el `PortalUser`).

## Auditoría transversal

Casi toda mutación llama a `logPortalAudit()` (best-effort: nunca tumba la acción) registrando actor (email del super-admin o `'master'`), acción, club, IP y detalle. Acciones tipadas: `CREATE_CLIENT`, `SUSPEND`, `IMPERSONATE`, `ASSIGN_PLAN`, `UPDATE_FEATURES`, `RESET_PASSWORD`, `CREATE/UPDATE/DELETE_PLAN`, `*_ADMIN`, `WEBHOOK_SUBSCRIPTION`, etc. Se leen en la pestaña Actividad. Contexto de por qué se auditó todo esto en [[Auditoría de seguridad]].

## Gotchas

- El panel es cliente puro: toda la seguridad real está en `requireAdmin()` de cada route, no en la UI. Ocultar una pestaña no protege nada.
- Distinguir **`priceMonthly` en vivo (Tenant)** de los **KPIs de snapshot**: los ingresos del dashboard pueden ir con retraso (cron horario de crm-mt) mientras que MRR/ARR reflejan el estado actual.
- La lógica de negocio (planes, tenants, admins, auditoría) está centralizada en `portal-store.ts`; los routes son finos y solo orquestan + auditan.
- Toda la data del panel vive en la **BD del portal**; el panel nunca abre conexiones a las BD de los tenants salvo indirectamente vía el script de aprovisionamiento.

## Relacionado

- [[Arquitectura Modelo C]]
- [[Autenticación y sesiones]]
- [[Planes y facturación del portal]]
- [[Alta automática por webhook]]
- [[Aislamiento entre clubes]]
- [[Auditoría de seguridad]]
