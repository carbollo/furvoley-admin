# 2026-05-18 — Autoconfiguración de webhooks Stripe (bootstrap)

## Por qué

> "necesitaria que la url del punto de conexion del webhook sea la url actual
> que tenga el servicio en railway"
>
> "ten en cuenta que necesito que se actualize automaticamente no que lo hagas
> tu manual por que la idea es clonar el servicio en railway por cada cliente
> nuevo que tengamos y solo tener que cambiar lo indispensable en las
> variables"

Los webhooks de Stripe ya no se configuran a mano. La app los crea/actualiza
desde el primer login del admin tras un deploy nuevo o un clonado del
servicio.

## Qué cambia

### Schema
- Nuevo modelo `StripeBootstrap` (singleton): guarda
  `platformWebhookId`/`platformWebhookSecret`,
  `connectWebhookId`/`connectWebhookSecret`, `publicUrl`, `lastSyncedAt` y
  `lastError`.

### Backend
- `src/lib/stripe-bootstrap.ts` — `detectPublicBaseUrl`, `detectWebhookUrl`,
  `getStripeBootstrapStatus`, `getPersistedWebhookSecrets`,
  `ensureStripeWebhooks`, `scheduleEnsureStripeWebhooks`.
- `src/app/api/stripe/webhook/route.ts` — ahora la verificación de firma usa
  primero las env vars (`STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CONNECT_WEBHOOK_SECRET`) y cae al singleton si no existen.
- `src/app/api/crm/data/route.ts` y
  `src/app/api/crm/club-settings/route.ts` — disparan
  `scheduleEnsureStripeWebhooks()` (throttled 5 min, no bloqueante) cada vez
  que un admin abre el CRM.
- `src/app/api/crm/club-settings/route.ts` (GET) — devuelve también
  `webhooks: { ok, configured, publicUrl, webhookUrl, platformWebhookId,
  connectWebhookId, hasPlatformSecret, hasConnectSecret, envOverridesPlatform,
  envOverridesConnect, lastSyncedAt, error }`.
- `src/app/api/crm/club-settings/bootstrap-stripe/route.ts` — `GET` (estado)
  y `POST` (forzar resync). Solo ADMIN.

### UI
- `ClubSettingsModal` → pestaña _Suscripción_ → nueva sección **Webhooks de
  Stripe (auto)**: muestra URL detectada, IDs de los endpoints, presencia de
  secrets, estado/última sync, y un botón _Sincronizar/Re-sincronizar_.

### Documentación
- `docs/features/stripe-bootstrap.md` — guía completa.
- `docs/project-index.md` — enlaces actualizados.

## Variables de entorno

### Lo único indispensable por cliente nuevo
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `STRIPE_SECRET_KEY` (de la plataforma)
- `STRIPE_CONNECTED_ACCOUNT_ID` (del cliente)

### Opcional
- `STRIPE_APPLICATION_FEE_PERCENT`
- `STRIPE_CLUB_CUSTOMER_ID`
- `STRIPE_DASHBOARD_URL`
- `NEXT_PUBLIC_APP_URL` (override del dominio público)

### Antes obligatorias, ahora auto
- `STRIPE_WEBHOOK_SECRET` → se autogenera
- `STRIPE_CONNECT_WEBHOOK_SECRET` → se autogenera

## Flujo en Railway

1. Clonar servicio.
2. Cambiar `DATABASE_URL`, `NEXTAUTH_SECRET`,
   `STRIPE_CONNECTED_ACCOUNT_ID`.
3. Deploy. Railway pobla `RAILWAY_PUBLIC_DOMAIN`.
4. Admin abre el CRM → bootstrap crea los webhooks y persiste secrets en BD.
5. Si en el futuro cambia el dominio (custom domain), la próxima vez que se
   abra el CRM `ensureStripeWebhooks` detecta la URL nueva y hace
   `webhookEndpoints.update` sin recrear ni invalidar secrets.
