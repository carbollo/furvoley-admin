---
tags: [portal-central, planes, facturacion, billing, mrr, arr, trial, kpis, cron, multi-tenant, modelo-c]
---

# Planes y facturación del portal

Capa comercial del SaaS: **qué paga cada club** al portal central. Vive por completo en la **BD del portal** (servicio con `PORTAL_CENTRAL_HOST=true`, `prisma` apunta a su propia `DATABASE_URL`). En las BDs de cada tenant estas tablas quedan vacías. Es una pieza del [[Panel de administración del portal]] dentro de la [[Arquitectura Modelo C]].

Código base: `src/lib/portal-central/portal-store.ts` (modelo de datos + billing), `prisma/schema.prisma` (bloque `--- PORTAL CENTRAL ---`), `src/app/api/portal-central/admin/plans/route.ts`, `src/app/api/jobs/trial-suspend/route.ts` y `src/lib/portal-kpis.ts`.

## Modelo de datos

**`Plan`** (comercial, editable por el super-admin) — `schema.prisma:1160`:
- `name`, `priceMonthly` (Float, `@default(0)`).
- `modules`: `Json` = lista de `CrmModuleId[]` incluidos (los módulos de [[RBAC y módulos]]). Vacío = ningún módulo opcional.
- `memberLimit`: `Int?` (null = ilimitado).
- `webhookToken`: `String? @unique` — token de la URL de [[Alta automática por webhook]] de ese plan.
- Relación 1-N con `Tenant` vía `onDelete: SetNull`.

**`Tenant`** — campos de facturación del cliente (`schema.prisma:1032`):
- `planId` / `plan` (opcional, `onDelete: SetNull`).
- **`priceMonthly`** (`Float?`): precio efectivo mensual, **base del MRR**. Puede venir del plan o ajustarse a mano.
- **`trialEndsAt`** (`DateTime?`): si está y es **futura**, el club está en PRUEBA; al caducar, el cron lo suspende.
- **`memberLimit`** (`Int?`): copiado del plan al asignarlo.
- `features` (`Json?`): mapa `moduleId → bool`; **ausente = activado** (solo se guardan desactivaciones).

Punto clave: los campos de precio/límite/features se **materializan en el `Tenant`** (no se leen del plan en vivo). Así, borrar un plan no rompe la facturación de sus clubes: conservan el precio y el límite ya fijados.

## assignPlanToTenant — deriva features, precio y límite

`assignPlanToTenant(tenantId, planId)` (`portal-store.ts:329`) es donde un plan se convierte en configuración concreta del club:
- Con `planId === null`: solo pone `planId: null` (el club conserva lo que ya tenía).
- Con un plan: calcula el set de módulos incluidos y construye `features` marcando `= false` **solo los módulos NO incluidos** (coherente con la convención "ausente = activado"). Luego escribe en el `Tenant`: `planId`, `priceMonthly` del plan, `memberLimit` del plan y `features` saneadas (`sanitizeFeatures`).

`updateTenant` (`portal-store.ts:353`) permite ajustar a mano `name`, `priceMonthly`, `trialEndsAt`, `memberLimit` sin tocar el plan (**el `slug` es inmutable**). El precio se **clampa a `>= 0`** (mismo criterio que `createPlan`/`updatePlan`) para que nunca un precio negativo reste del MRR; `null` = sin precio.

## CRUD de planes (API)

`src/app/api/portal-central/admin/plans/route.ts` — GET/POST/PATCH/DELETE, todos tras `requireAdmin()` (host portal + `PORTAL_ADMIN_PASSWORD` configurada + sesión de super-admin; ver [[Autenticación y sesiones]]). Cada mutación deja rastro con `logPortalAudit` (acciones `CREATE_PLAN`/`UPDATE_PLAN`/`DELETE_PLAN`, ver [[Auditoría de seguridad]]).
- **Cada plan nace con `webhookToken`** (`createPlan`). El PATCH con `ensureWebhook`/`regenerateWebhook` genera o **rota** el token (rotar invalida la URL anterior).
- `updatePlan` normaliza módulos (solo `CrmModuleId` válidos, sin duplicados) y `memberLimit` (`normalizeLimit`: entero `> 0` o null).
- `deletePlan`: por `onDelete: SetNull`, los clubes quedan sin plan pero **conservan precio/límite/features** ya fijados.

## computePortalBilling — MRR / ARR / trials

`computePortalBilling()` (`portal-store.ts:378`) es la fuente de los ingresos recurrentes:
- Lee solo los `Tenant` con `status = 'ACTIVE'` (campos `priceMonthly`, `trialEndsAt`).
- Un club **en prueba** (`trialEndsAt` en el futuro) se cuenta en **`trials`** y **se EXCLUYE del MRR** (aún no paga: no debe inflar los ingresos recurrentes).
- El resto suma su `priceMonthly` al **MRR**. Devuelve `{ mrr, arr: mrr * 12, activeClubs, trials }`.

Se calcula **en vivo** (lectura directa de `Tenant`), no del snapshot, así el dashboard siempre tiene MRR aunque no haya snapshot todavía. Lo consume `admin/metrics/route.ts` (con `.catch` a ceros si falla).

## Reparto de beneficios (dashboard)

Sobre el MRR se muestra en el dashboard una tarjeta **"Reparto de beneficios"** que lo divide en **dos partes** (por defecto **60% "Tú" / 40% "ProClub"**), con **porcentaje y etiquetas editables** desde el panel:
- Config persistida en el modelo genérico **`PortalSetting`** (`key/value Json`, `schema.prisma`), clave `profit_split = { selfPct, selfLabel, otherLabel }`. La tabla la crea el `db push` de arranque del portal.
- `getProfitSplit()` / `setProfitSplit()` (`portal-store.ts`): defaults 60/40, `selfPct` clampado a 0-100 y etiquetas a 40 chars. Ruta `admin/profit-split/route.ts` (GET/PATCH, `requireAdmin`, audita `UPDATE_PROFIT_SPLIT`; el PATCH degrada a 503 JSON si la tabla aún no existe).
- **Los euros se derivan del MRR en vivo** en el cliente: `selfMonthly = mrr*selfPct/100`, `otherMonthly = mrr - selfMonthly` (suman exacto). Es reparto de **ingresos** (MRR), no de beneficio neto tras costes.

## Cron trial-suspend

`src/app/api/jobs/trial-suspend/route.ts` — tarea **diaria** en el servicio portal:
- Auth por `requireCronAuth` (Bearer `CRON_SECRET`); si no es host portal, responde `skipped`.
- Busca `Tenant` con `status: 'ACTIVE'` y `trialEndsAt: { not: null, lt: now }`, los pasa a **`SUSPENDED`** y registra `logPortalAudit({ action: 'AUTO_SUSPEND_TRIAL', actor: 'cron' })` por cada uno.
- Opera **solo sobre la BD del portal** (`prisma` = portal), **no recorre tenants** (ver [[Resolución de tenant]]). Suspender un club es lo que corta su acceso al CRM en el login/SSO.

## KPIs cross-club (dashboard)

Los KPIs operativos (socios, ingresos del mes, cobros pendientes) son **distintos** de la facturación del SaaS y viven en `src/lib/portal-kpis.ts` + `PortalKpiSnapshot`:
- Por el [[Aislamiento entre clubes]], el portal **no** puede consultar las BDs `tenant_*`. El cron corre en **crm-mt** (`snapshot-cron.ts` → `collectAndStoreSnapshot`), único servicio con acceso a los tenants: recorre los clubes `ACTIVE` con `forEachTenant`, agrega y **escribe una fila** de snapshot en la BD del portal con un **pg `Client` directo** (no `prisma`: fuera de `withTenant` en crm-mt, `prisma` lanzaría).
- El portal **solo LEE** el último snapshot + una serie de 30 para las gráficas (`admin/metrics/route.ts`). Si la tabla aún no existe (primer deploy), degrada a `latest: null`.
- Cada snapshot guarda agregados globales en columnas y el desglose por club en `perClub` (JSON). Los clubes que no respondieron van además a la bandeja central de errores (`PortalErrorLog`).

## Gotchas

- **`memberLimit` es cosmético (soft limit).** Solo se muestra en la UI del portal (barra de progreso socios/límite, rojo al llegar al tope) comparando contra `membersTotal` del snapshot. **No hay enforcement** al crear socios en el CRM del club: superar el límite no bloquea nada.
- **El MRR usa el `Tenant`, no el `Plan`.** Editar `priceMonthly` de un plan no cambia el MRR de clubes ya asignados hasta que se reasigne el plan (o se edite el club a mano).
- **Trials no cuentan en MRR pero sí bloquean features.** Un club en prueba ya tiene sus `features` derivadas del plan; lo único pendiente es el pago.
- **Precio siempre `>= 0`** en las tres rutas de escritura (plan crear/editar, tenant editar) para no ensuciar el MRR.
- El **snapshot de KPIs y la facturación son independientes**: el MRR se lee en vivo; los KPIs vienen del último snapshot (pueden estar desfasados hasta la siguiente pasada del cron de crm-mt).

## Relacionado

- [[Panel de administración del portal]]
- [[Alta automática por webhook]]
- [[RBAC y módulos]]
- [[Arquitectura Modelo C]]
- [[Aislamiento entre clubes]]
- [[Auditoría de seguridad]]
