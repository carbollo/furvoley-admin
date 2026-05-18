# 2026-05-18 — Stripe Connect funcional + contabilidad solo por CSV

## Resumen
Activamos el ciclo completo de cobros vía Stripe Connect (Direct Charges):
emisión de checkouts, gestión de mensualidades como suscripciones nativas de
Stripe y registro automático del estado de pago. La **contabilidad oficial
queda aislada**: solo se construye importando el CSV del banco.

## Política contable
- `recordInvoicePayment(...)` ahora **omite** la creación de `Transaction` y
  `JournalEntry` cuando `method === 'STRIPE'`. La factura interna se marca
  PAID/PARTIAL pero no aparece en el libro mayor.
- Cuando el ingreso de Stripe aterriza en la cuenta bancaria del club y se
  importa el CSV (`/accounting/bank-import`), el admin concilia la línea
  contra la factura o crea el asiento desde la línea bancaria
  (`createLedgerFromBankLine`). Ese es el momento en que el cobro entra en la
  contabilidad.
- `BANK_TRANSFER` y `CASH` siguen creando Transaction + JournalEntry de
  inmediato (cobros registrados a mano en el CRM).

## Webhook Stripe ampliado

`src/app/api/stripe/webhook/route.ts` ahora gestiona:

| Evento | Acción |
|---|---|
| `checkout.session.completed` (mode=payment) | Marca la factura interna como PAID. Idempotente por `payment_intent`. |
| `checkout.session.completed` (mode=subscription) | Guarda `stripeSubscriptionId` y `stripeCustomerId` en la Subscription interna y la deja `ACTIVE` con `autoPay: true`. El primer cobro se procesa por el evento `invoice.payment_succeeded`. |
| `invoice.paid` / `invoice.payment_succeeded` | Caso A (metadata.invoiceId): marca PAID esa factura. Caso B (cobro recurrente): localiza la Subscription por `stripeSubscriptionId`, genera la siguiente factura interna del período y la marca PAID. Idempotente por `payment_intent`. |
| `invoice.payment_failed` | Marca como `OVERDUE` la última factura PENDING/PARTIAL de la suscripción y registra `PaymentAttempt` FAILED. |
| `payment_intent.payment_failed` | Registra `PaymentAttempt` FAILED en la factura asociada (matching por ID del intent). |
| `customer.subscription.created` / `updated` | Sincroniza el `status` (active/trialing → ACTIVE, paused → PAUSED, canceled/incomplete_expired/unpaid → CANCELED). |
| `customer.subscription.deleted` | Marca Subscription como CANCELED + endDate=now. |

El webhook también acepta dos secrets: `STRIPE_WEBHOOK_SECRET` (plataforma) y
`STRIPE_CONNECT_WEBHOOK_SECRET` (cuenta conectada). Probamos firma con ambos
secuencialmente.

## Flujos end-to-end soportados

### Cobro puntual de una factura
1. Admin (o el propio socio desde `/my-billing`) pulsa "Pagar con Stripe".
2. `createInvoiceStripeLink(invoiceId)` crea una Checkout Session con
   `Stripe-Account = STRIPE_CONNECTED_ACCOUNT_ID` (Direct Charges) y opcional
   `application_fee_amount` según `STRIPE_APPLICATION_FEE_PERCENT`.
3. El socio paga; Stripe envía `checkout.session.completed` → factura PAID.
4. La conciliación contable llegará con el CSV.

### Suscripción de mensualidad
1. Admin asigna un plan: `createSubscription({ memberId, planId, autoPay:true })`
   crea la `Subscription` interna y la primera `Invoice` PENDING.
2. Admin envía el enlace de checkout
   (`createSubscriptionStripeLink(subscriptionId)` → mode=subscription en la
   cuenta conectada del cliente).
3. El socio introduce su tarjeta una vez. Stripe activa la `Subscription`,
   cobra la primera invoice y envía:
   - `checkout.session.completed` (mode=subscription): vincula los IDs en la
     `Subscription` interna.
   - `invoice.payment_succeeded`: marca como PAID la **siguiente** factura
     interna que `createInvoiceForSubscription` genera (avanzando
     `nextInvoiceDate`).
4. Cada mes (o el período configurado), Stripe cobra automáticamente y
   reenvía `invoice.payment_succeeded`. El webhook genera la nueva factura
   interna del período y la marca PAID.
5. Si falla: `invoice.payment_failed` → OVERDUE. Admin puede contactar al
   socio; cuando se reintenta y se cobra, el ciclo vuelve a la normalidad.

### Cancelación
- Admin o socio cancela desde el Stripe Customer Portal del club.
- Stripe emite `customer.subscription.deleted` → status `CANCELED` en BD.

## Cambios concretos
- **`src/app/actions/billing.ts`**: `recordInvoicePayment` skip
  Transaction/JournalEntry para STRIPE.
- **`src/app/api/stripe/webhook/route.ts`**: reescrito con handlers
  modulares (`onCheckoutSessionCompleted`, `onInvoicePaymentSucceeded`,
  `onInvoicePaymentFailed`, `onPaymentIntentFailed`, `onSubscriptionUpserted`,
  `onSubscriptionDeleted`) y helper de idempotencia `alreadyRecorded`.
- **Documentación Obsidian**: este changelog.

## Notas técnicas
- En la API version `2026-03-25.dahlia`, `Invoice.subscription` y
  `Invoice.payment_intent` ya no están tipados como propiedades top-level.
  Se accede con un cast `LegacyInvoice` para compatibilidad con la
  representación JSON que llega por webhook.
- Type-check OK (`tsc --noEmit`), sin lints nuevos.
- No hay cambios de esquema en esta sesión.
