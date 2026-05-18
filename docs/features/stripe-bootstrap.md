# Stripe Bootstrap automático

Permite que **cada clon nuevo del servicio** en Railway funcione sin que el
operador tenga que crear webhooks manualmente en el Dashboard de Stripe.

## Variables de entorno

### Indispensables por cliente

- `DATABASE_URL` — Postgres del servicio.
- `NEXTAUTH_SECRET` — sesión de NextAuth.
- `STRIPE_SECRET_KEY` — clave secreta de la plataforma (la cuenta dueña de
  Connect). La misma para todos los clones cuando los clientes son cuentas
  conectadas de la misma plataforma.
- `STRIPE_CONNECTED_ACCOUNT_ID` — `acct_…` del cliente concreto. **Esto es lo
  único que cambia por cliente.**

### Opcionales

- `STRIPE_APPLICATION_FEE_PERCENT` — fee de plataforma (por defecto `0`).
- `STRIPE_CLUB_CUSTOMER_ID` — `cus_…` de la suscripción del club al servicio
  (acceso al Customer Portal).
- `STRIPE_DASHBOARD_URL` — URL del dashboard (por defecto
  `https://dashboard.stripe.com`).
- `NEXT_PUBLIC_APP_URL` — override del dominio público; si no se define se
  toma `RAILWAY_PUBLIC_DOMAIN` (auto-poblada por Railway).

### Auto-gestionadas (ya **no** indispensables)

- `STRIPE_WEBHOOK_SECRET` — se crea automáticamente.
- `STRIPE_CONNECT_WEBHOOK_SECRET` — se crea automáticamente.

> Si en algún momento se definen como env vars, ganan ellas (override).

## Cómo funciona

1. **Detección de URL**: `detectPublicBaseUrl` (en
   `src/lib/stripe-bootstrap.ts`) toma la primera fuente disponible entre
   `NEXT_PUBLIC_APP_URL` → `RAILWAY_PUBLIC_DOMAIN` → `VERCEL_URL`.
2. **Disparo lazy**: cada vez que el admin abre el CRM, `/api/crm/data` y
   `/api/crm/club-settings` invocan `scheduleEnsureStripeWebhooks()` (no
   bloqueante, throttled a una vez cada 5 minutos).
3. **`ensureStripeWebhooks`** crea o actualiza dos `WebhookEndpoint`:
   - `platform`: eventos de la cuenta de la plataforma.
   - `connect`: eventos de cuentas conectadas (Direct Charges).
   Es **idempotente**: si los IDs ya existen y la URL coincide, no hace nada.
   Si la URL ha cambiado (clon nuevo, nuevo dominio), actualiza la URL en los
   endpoints existentes vía `webhookEndpoints.update`.
4. **Persistencia**: el singleton `StripeBootstrap` guarda `platformWebhookId`,
   `platformWebhookSecret`, `connectWebhookId`, `connectWebhookSecret`,
   `publicUrl` y `lastSyncedAt`.
5. **Verificador**: `/api/stripe/webhook` lee primero los secrets de las env
   vars y, si no existen, cae al singleton `StripeBootstrap`.

## Resync manual

- **UI**: Modal _Configuración del club_ → pestaña _Suscripción_ →
  sección **Webhooks de Stripe (auto)** → botón _Sincronizar/Re-sincronizar_.
- **API**: `POST /api/crm/club-settings/bootstrap-stripe` (solo ADMIN).
- **Estado**: `GET /api/crm/club-settings/bootstrap-stripe`.

## Eventos suscritos

```
checkout.session.completed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
payment_intent.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Lista en `REQUIRED_WEBHOOK_EVENTS` (`src/lib/stripe-bootstrap.ts`); ampliar
ahí si en el futuro se necesitan más eventos.

## Flujo "clonar servicio para un cliente nuevo"

1. Duplicar el servicio en Railway (mismo código).
2. Pegar nueva `DATABASE_URL` (BD propia del cliente) y nuevo
   `STRIPE_CONNECTED_ACCOUNT_ID`.
3. `NEXTAUTH_SECRET` propio.
4. Deploy. Railway pobla `RAILWAY_PUBLIC_DOMAIN` automáticamente.
5. Admin entra al CRM → al cargar el bundle se crean los webhooks contra ese
   dominio y se guardan los `whsec_…` en `StripeBootstrap`.
6. A partir de ahí los webhooks funcionan sin intervención manual.
