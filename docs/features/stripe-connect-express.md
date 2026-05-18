# Stripe Connect Express — onboarding desde el CRM

Permite que el cliente (club) **conecte su propia cuenta de Stripe** al CRM
con un solo botón, sin tener que crearla en el dashboard de Stripe ni copiar
manualmente el `acct_…`.

Tipo de cuenta: **Express** (dashboard simplificado hospedado por Stripe).

## Configuración previa (una sola vez, en la cuenta de plataforma)

Esto se hace **una vez**, en la cuenta de Stripe **de la plataforma** (la
dueña de `STRIPE_SECRET_KEY`). NO en la cuenta del cliente.

1. Inicia sesión en `https://dashboard.stripe.com` con la cuenta de
   plataforma.
2. **Settings → Connect settings → Onboarding options**: activa **Express**
   onboarding.
3. **Branding**: en _Settings → Connect → Branding_ define el logo, nombre y
   color que verán los clientes durante el onboarding y en su dashboard
   Express.
4. **Capabilities**: `card_payments` y `transfers` (por defecto se piden al
   crear la cuenta).
5. Opcional: define una URL de soporte que verá el cliente.

> No hace falta crear una "app" en Stripe ni publicar nada en el Marketplace.
> El onboarding Express es nativo de Connect y solo requiere `STRIPE_SECRET_KEY`.

## Flujo en el CRM (ya implementado)

1. Admin abre **Configuración del club → Suscripción**.
2. En la sección _Stripe Connect — cuenta del cliente_ pulsa **Conectar mi
   cuenta de Stripe**.
3. El backend (`POST /api/crm/stripe-connect/start`) crea una cuenta Express
   con `stripe.accounts.create` y un `AccountLink` con
   `stripe.accountLinks.create({ type: 'account_onboarding' })`.
4. El admin completa el onboarding hospedado por Stripe (datos personales,
   negocio, cuenta bancaria, verificación).
5. Stripe redirige a `/api/crm/stripe-connect/return` → refresca estado y
   redirige al CRM con `?stripeConnect=connected`.
6. El CRM detecta el query y vuelve a abrir el modal con el estado
   actualizado: ✓ Onboarding, ✓ Cobros, ✓ Transferencias.

Si el `AccountLink` caduca (típico tras 5 minutos) o el admin pulsa "Volver",
Stripe redirige a `/api/crm/stripe-connect/refresh` y el modal se reabre
para reanudar.

## Variables de entorno

- `STRIPE_SECRET_KEY` — obligatoria (la de la plataforma).
- `STRIPE_CONNECTED_ACCOUNT_ID` — opcional. **Override**: si está definida
  gana sobre lo persistido en BD y el botón de "Conectar" queda
  deshabilitado.
- `STRIPE_APPLICATION_FEE_PERCENT` — comisión de plataforma sobre cada cobro.
- `NEXT_PUBLIC_APP_URL` / `RAILWAY_PUBLIC_DOMAIN` — para construir las
  `return_url` y `refresh_url` del onboarding.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/crm/stripe-connect/start` | Crea (o reutiliza) la cuenta Express y devuelve `{ url }` al onboarding. |
| `POST` | `/api/crm/stripe-connect/status` | `accounts.retrieve` y actualiza flags en BD. |
| `POST` | `/api/crm/stripe-connect/disconnect` | Olvida la cuenta en el CRM (no la borra en Stripe). |
| `GET` | `/api/crm/stripe-connect/return` | Vuelta tras completar onboarding. |
| `GET` | `/api/crm/stripe-connect/refresh` | Vuelta tras AccountLink expirado. |

Todos los `POST` requieren rol **ADMIN**.

## Schema persistido (`ClubSettings`)

- `stripeConnectedAccountId` — `acct_…`.
- `stripeAccountType` — `express` (futuro: standard / custom).
- `stripeChargesEnabled` — el cliente puede cobrar.
- `stripePayoutsEnabled` — el cliente puede recibir transferencias.
- `stripeDetailsSubmitted` — onboarding completado.
- `stripeAccountStatusAt` — timestamp del último `accounts.retrieve`.

## Cómo usar la cuenta conectada para cobros

`getStripeConnectConfig()` resuelve la cuenta en este orden:
`STRIPE_CONNECTED_ACCOUNT_ID` (env) → `ClubSettings.stripeConnectedAccountId`
(BD). Todos los Checkout Session creators
(`createInvoiceStripeLink`, `createSubscriptionStripeLink`, `generateStripeLink`)
usan este helper y envían el header `Stripe-Account` automáticamente para
Direct Charges.

## Caso "clonar el servicio para un cliente nuevo"

Dos modos posibles, elige uno por cliente:

### Modo A — env var (lo más simple si ya tienes el acct_…)
Pega `STRIPE_CONNECTED_ACCOUNT_ID=acct_…` en Railway. El CRM lo respeta como
override y el botón "Conectar mi cuenta" queda deshabilitado.

### Modo B — onboarding desde el CRM (lo más cómodo para el cliente)
Despliega sin `STRIPE_CONNECTED_ACCOUNT_ID`. El admin entra al CRM, pulsa
**Conectar mi cuenta de Stripe** y completa el onboarding en Stripe. El
`acct_…` queda persistido en BD.

En ambos casos los webhooks se autoconfiguran (ver
[[stripe-bootstrap]]).
