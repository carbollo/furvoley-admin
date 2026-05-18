# 2026-05-18 — Stripe Connect (Direct Charges) hacia la cuenta del cliente

## Resumen
Conectamos la plataforma con la cuenta de Stripe del cliente (club). Todos los cobros de socios se enrutan a la cuenta conectada vía `Stripe-Account` header (**Direct Charges**), con opción de comisión de plataforma. Todo se configura por env vars de Railway, sin tocar el modelo de datos.

## Variables de entorno (Railway)
- `STRIPE_CONNECTED_ACCOUNT_ID=acct_XxxxxXxxxx` — Cuenta conectada del cliente. Si no está, los cobros se hacen en la cuenta de la plataforma (modo "single-tenant").
- `STRIPE_APPLICATION_FEE_PERCENT=0` — Comisión opcional que la plataforma se queda sobre cada cobro (0 a 100). Default: 0 (sin comisión).
- `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…` — Secret del endpoint Connect (eventos enviados como cuenta conectada).
- `STRIPE_WEBHOOK_SECRET=whsec_…` — Sigue siendo el secret del endpoint de la cuenta de la plataforma.

> Si solo se rellena uno de los dos secrets, los eventos del otro se rechazarán con 400. Lo habitual es crear ambos en el Dashboard.

## Cambios

### Helper centralizado
- **`src/lib/club-settings.ts`**: nuevo `getStripeConnectConfig()` → `{ connectedAccountId, hasConnectedAccount, connectedAccountIdMasked, applicationFeePercent }` leídos de Railway.

### Checkouts (Direct Charges)
- **`src/app/actions/billing.ts`**:
  - `createInvoiceStripeLink`: ahora pasa `{ stripeAccount: connectedAccountId }` como request option si está configurado. `application_fee_amount` se calcula a partir del porcentaje sobre los céntimos pendientes.
  - `createSubscriptionStripeLink`: idem; `subscription_data.application_fee_percent` se rellena cuando la comisión es > 0.
- **`src/app/actions.ts`** (`generateStripeLink` legacy): mismo tratamiento.
- Todos los `metadata.stripeAccount` ahora reflejan el account ID utilizado.

### Endpoint nuevo
- **`POST /api/crm/club-settings/connect-login`**:
  - Intenta `stripe.accounts.createLoginLink(acct_…)` (cuentas con dashboard Express).
  - Si la cuenta no admite login link (Standard/Full), responde con `dashboardUrl` genérico + nota explicativa.

### Webhook
- **`src/app/api/stripe/webhook/route.ts`**: ahora valida la firma contra `STRIPE_WEBHOOK_SECRET` y, si falla, contra `STRIPE_CONNECT_WEBHOOK_SECRET`. Los eventos de Connect llevan `event.account` poblado; se devuelven en la respuesta para depuración.

### UI — Modal
- **`src/components/crm/ClubSettingsModal.tsx`**: la pestaña *Suscripción* ahora muestra dos bloques:
  1. **Stripe Connect — cuenta del cliente**: account ID enmascarado, comisión de plataforma, badge verde/amarillo según estado, y botón **"Abrir dashboard del cliente conectado"** (deshabilitado si la env var falta).
  2. *Portal del cliente Stripe* (suscripción SaaS) y *Dashboard de Stripe* (sin cambios).
- El endpoint expone también `connect: { source, hasConnectedAccount, connectedAccountIdMasked, applicationFeePercent }` en `GET /api/crm/club-settings`.

## Decisiones de diseño

### ¿Direct Charges o Destination Charges?
- Elegimos **Direct Charges** (header `Stripe-Account`) porque encajan con el modelo: *"el CRM es para un cliente que gestiona los pagos de sus socios"*. El cliente es responsable del cobro, la disputa y la liquidación; la plataforma solo provee la herramienta.
- Si en el futuro el SaaS quiere asumir liability/gestión de devoluciones, sería trivial migrar a Destination Charges (`transfer_data.destination`) cambiando `requestOptions` por `params.transfer_data`.

### Cuentas v2 vs Cuentas v1
- En esta integración no creamos ni onboardamos cuentas. El cliente conectado se gestiona externamente (link de Connect, embed o creación manual) y se pega el `acct_…` en Railway. Por eso no tocamos las APIs de `v2/core/accounts`. Mantener todo en env vars evita registrar PII de cuentas en nuestra BD.

## Notas
- Tipos OK (`tsc --noEmit`), sin nuevos lints.
- Sin cambios de esquema en esta sesión.
- Si activas comisiones, recuerda que `application_fee_amount` (pagos) y `application_fee_percent` (subscripciones) se cobran a la cuenta conectada y se transfieren a la plataforma automáticamente.
