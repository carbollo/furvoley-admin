# 2026-05-18 — Onboarding Express desde el CRM

## Por qué

> "me ayudas a crear una aplicacion de stripe para conectar la cuenta de
> stripe connect de mis usuarios al crm"

Antes el operador tenía que crear el `acct_…` en el Dashboard de Stripe y
copiarlo a `STRIPE_CONNECTED_ACCOUNT_ID` en Railway. Ahora el admin del club
puede **conectar su propia cuenta** desde un botón del CRM y completar el
onboarding hospedado por Stripe.

## Modelo

Stripe Connect **Express** (Account Link). El env var
`STRIPE_CONNECTED_ACCOUNT_ID` sigue siendo válida como override (gana
siempre).

## Qué cambia

### Schema (`ClubSettings`)
Nuevos campos opcionales:
- `stripeConnectedAccountId`, `stripeAccountType` (`express` por defecto).
- `stripeChargesEnabled`, `stripePayoutsEnabled`, `stripeDetailsSubmitted`.
- `stripeAccountStatusAt`.

### Backend (`src/lib/club-settings.ts`)
- `getStripeConnectConfig()` es ahora **async** y resuelve en este orden:
  env var → BD → ninguno.
- Tipo `StripeConnectConfig` añade `source`, `accountType`, flags de
  onboarding y `statusAt`.

### Endpoints nuevos
- `POST /api/crm/stripe-connect/start` — crea (o reutiliza) la cuenta Express
  y devuelve `{ url, accountId, expiresAt }`. Bloqueado si el env var
  override está activo.
- `POST /api/crm/stripe-connect/status` — `accounts.retrieve` + actualiza
  flags en BD.
- `POST /api/crm/stripe-connect/disconnect` — limpia el `acct_…` de BD (no
  elimina la cuenta en Stripe).
- `GET /api/crm/stripe-connect/return` — vuelta tras onboarding completo;
  refresca estado y redirige a `/?stripeConnect=connected`.
- `GET /api/crm/stripe-connect/refresh` — vuelta tras AccountLink expirado;
  redirige a `/?stripeConnect=refresh`.

### Consumidores actualizados (async)
- `src/app/actions/billing.ts` (`createInvoiceStripeLink`,
  `createSubscriptionStripeLink`).
- `src/app/actions.ts` (`generateStripeLink`).
- `src/app/api/crm/club-settings/route.ts`.
- `src/app/api/crm/club-settings/connect-login/route.ts`.

### UI (`ClubSettingsModal`)
- Sección _Stripe Connect — cuenta del cliente_ rediseñada:
  - Indicador de origen: env / BD / no configurado.
  - Tipo de cuenta y `statusAt`.
  - Tres pills de estado: Onboarding, Cobros, Transferencias.
  - Botones contextuales: _Conectar_, _Completar onboarding_,
    _Refrescar estado_, _Abrir dashboard del cliente_, _Desvincular cuenta_.
- `CrmApp` detecta `?stripeConnect=connected|refresh` tras la vuelta del
  onboarding y reabre el modal en la pestaña Suscripción.

### Documentación
- `docs/features/stripe-connect-express.md` — guía completa de configuración
  y endpoints.
- `docs/project-index.md` — enlaces actualizados.

## Configuración previa en Stripe (una sola vez, plataforma)

1. Dashboard de la cuenta de plataforma → _Settings → Connect_.
2. Activar **Express onboarding**.
3. Configurar _Branding_ (logo, color, nombre que verán los clientes).

## Variables de entorno

- `STRIPE_SECRET_KEY` — obligatoria, plataforma.
- `STRIPE_CONNECTED_ACCOUNT_ID` — opcional (override).
- `STRIPE_APPLICATION_FEE_PERCENT` — opcional, comisión.
- `NEXT_PUBLIC_APP_URL` / `RAILWAY_PUBLIC_DOMAIN` — para `return_url` y
  `refresh_url`.

## Flujo "clonar para cliente nuevo"

- Despliega el servicio sin `STRIPE_CONNECTED_ACCOUNT_ID`.
- Admin abre _Configuración del club → Suscripción → Conectar mi cuenta de
  Stripe_.
- Tras el onboarding la cuenta queda persistida en BD y los cobros se
  enrutan automáticamente vía Direct Charges.
