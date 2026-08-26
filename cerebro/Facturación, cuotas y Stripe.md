---
tags: [facturacion, stripe, cuotas, suscripciones, crm, multitenant, cron, idempotencia]
---

# Facturación, cuotas y Stripe

Módulo de **ingresos del CRM del club** (no confundir con la facturación del portal a los clubes, que vive en [[Planes y facturación del portal]]). Facturas, planes de socio, suscripciones recurrentes, cobros Stripe y recordatorios. Todo corre **dentro de la BD del tenant activo** (proxy `@/lib/prisma`, ver [[Resolución de tenant]] y [[Arquitectura Modelo C]]).

Ficheros clave: `src/lib/crm-invoice-create.ts` (numeración), `src/app/actions/billing.ts` (lógica central), `src/lib/billing-dates.ts` (fechas de cobro), `src/lib/stripe-checkout.ts` (links de pago), `src/app/api/stripe/webhook/route.ts` (webhook) y los crons `src/app/api/jobs/billing*`.

## Numeración de factura: max()+1, nunca count()

`invoiceNumber` es `FV-YYYY-NNNNN` (`@unique` en el modelo `Invoice`). La secuencia se deriva de **`invoiceBaseSeqForYear()`**, que hace `findFirst` ordenado por `invoiceNumber` desc y parsea el sufijo — es decir **max(num)+1**, no `count()`.

- **Por qué no count():** si se borra una factura intermedia, `count()` devolvería un número ya usado y colisionaría con el `@unique` de forma **permanente** (facturación rota). max()+1 nunca reutiliza un número quemado.
- El **ancho fijo `padStart(5, '0')`** hace que el orden lexicográfico == numérico, por eso el `orderBy: 'desc'` sobre el string funciona.
- `invoiceCountForYear()` sigue existiendo pero es solo informativo; la numeración real usa la base secuencial.

## Reintento ante colisión (P2002)

Como max()+1 no es atómico frente a **altas concurrentes**, dos creaciones simultáneas pueden calcular el mismo número y una chocará con el `@unique`. El patrón en todo el módulo es **calcular número → crear → si `isUniqueViolation` (código Prisma `P2002`) reintentar** (hasta 5 veces):

- **`createInvoiceWithNumber(build, retries=5)`**: helper genérico. Recibe un callback que devuelve los args de `create`; usado por `createMemberInvoice`, `createManualInvoice`.
- **`createTeamInvoices`**: numera un lote entero desde `invoiceBaseSeqForYear` + `invoiceNumberAtOffset(base, index)` dentro de **una `$transaction`**, y reintenta el lote completo si colisiona.
- `nextInvoiceNumber()` recalcula la base en cada intento (no cachea).

## Planes de socio (`MembershipPlan`)

`amount`, `billingPeriod` (`MONTHLY`/`QUARTERLY`/`YEARLY`), `enrollmentFee` (matrícula), `paymentRequiredOnEnrollment` y `billingDayOfMonth`.

- **`clampBillingDay`** acota el día de cobro a **[1, 28]** (evita meses cortos). `billing-dates.ts` preserva el día al avanzar ciclos, ajustándolo si el mes es más corto.
- **Borrado seguro (`deleteMembershipPlan`):** si el plan tiene suscripciones → **soft delete** (`isActive=false`); si no, borrado duro. La FK `plan` usa `onDelete: Restrict`.

## Suscripciones (`Subscription`)

`nextInvoiceDate` marca cuándo toca la próxima cuota; `autoPay` indica cobro automático vía Stripe. `createSubscription`:

1. Calcula `nextInvoiceDate` inicial: **hoy** si `paymentRequiredOnEnrollment`, si no la próxima fecha alineada al `billingDayOfMonth`.
2. Si el pago es requerido al alta, pone al socio en **`PENDING_PAYMENT`** y dispara `runMemberStatusChangedWorkflows` ([[Motor de workflows]]).
3. Emite la **primera factura** con `createInvoiceForSubscription`.

**Descuentos** (`DiscountCode`, roadmap 6.5): `PERCENT` o `FIXED` sobre la cuota del periodo (nunca sobre la matrícula), acotado para no dejar el subtotal en negativo. Se añade como línea con importe negativo.

## `createInvoiceForSubscription` — atómica y sin doble cobro

El punto crítico: crear la factura **y** avanzar `nextInvoiceDate` en **una sola `$transaction`**. Si se hicieran por separado y algo fallara entre medias, quedaría la factura creada con la suscripción SIN avanzar → el siguiente ciclo **re-facturaría el mismo periodo = doble cobro**. El número se deriva de max()+1 y se reintenta ante P2002 (mismo patrón que arriba).

Detalles: la primera factura puede incluir la matrícula (`enrollmentFee`); `taxAmount` en las cuotas de suscripción es **0** (el IVA de facturas manuales se gestiona en `buildInvoicePayload`); el status inicial es `OVERDUE` si el vencimiento ya pasó, si no `PENDING`.

`buildInvoicePayload` (facturas manuales/OTHER) **acota IVA y retención a [0, 100]**: sin tope, un `taxRate` enorme inflaba el total y una retención >100 dejaba el total **negativo** persistido — de hecho rechaza cualquier `totalAmount < 0`.

## `generateDueInvoices` — cron por-tenant

Busca suscripciones `ACTIVE` con `nextInvoiceDate <= hoy` y llama a `createInvoiceForSubscription` para cada una, **envuelta en try/catch individual**: un fallo puntual (datos de un socio) no debe impedir facturar al resto del club. Luego `updateInvoiceStatuses()` marca `OVERDUE` las vencidas impagadas.

Los crons `POST/GET /api/jobs/billing` y `/api/jobs/billing-cycle` autentican con **Bearer `CRON_SECRET`** (`requireCronAuth`) y recorren **todos los tenants** con `forEachTenant` (Modelo C): sin ejecutar dentro de `withTenant`/`als.run`, el proxy de prisma lanzaría "sin tenant" y la facturación caería para todos (ver [[Aislamiento entre clubes]] y [[Operaciones, entorno y convenciones]]).

## `recordInvoicePayment` — incremento atómico

Registra siempre un `PaymentAttempt` y, si el pago es `SUCCEEDED`:

- **Incremento atómico** de `paidAmount` (`{ increment: amount }`) **y** derivación de `status`/`paidAt` en la **misma `$transaction`**. El UPDATE del incremento bloquea la fila hasta el commit, así **dos cobros concurrentes se serializan** (webhook + mark-paid, o reentregas en réplicas): cada uno calcula el status sobre el valor real ya incrementado. Sin esto, un update de status suelto podía reordenarse y dejar la factura **pagada pero marcada `PARTIAL`** (sin activar al socio ni disparar workflows).
- Al quedar `PAID`, dispara `runInvoicePaidWorkflows` y `tryActivateMemberAfterEnrollmentPayment` (socio `PENDING_PAYMENT` → `ACTIVE`).
- **Política contable:** los cobros **por Stripe NO generan `Transaction`/`JournalEntry`** — la contabilidad oficial se llena solo desde el CSV bancario (conciliación). En cambio, `CASH` y `BANK_TRANSFER` (cobros manuales que no pasan por el extracto) **sí** crean asiento de inmediato. Ver [[Contabilidad]].

## Webhook de Stripe (`/api/stripe/webhook`)

Endpoint **único** para eventos de plataforma y de cuentas conectadas (Stripe Connect / Direct Charges).

- **Firma:** los signing secrets salen de BD (`StripeBootstrap`, autogenerados al sincronizar webhooks) con override opcional por env (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`). Se prueban ambos secretos con `constructEvent`; si ninguno valida → `400`.
- **Filtro multi-deploy:** con varios clones en Railway sobre la misma cuenta plataforma, Stripe entrega cada evento Connect a todos los endpoints. El handler **ignora con 200** cualquier evento cuyo `event.account` no sea el `acct_…` de este servicio, para no mezclar clubes ni devolver 500 por factura inexistente.
- **Idempotencia:** Stripe entrega "at-least-once" y permite reenvíos manuales. Como `recordInvoicePayment` **suma** a `paidAmount`, antes de registrar se comprueba **`alreadyRecorded(paymentIntent)`** / **`alreadyRecordedCheckout(paymentIntent, sessionId)`** (busca un `PaymentAttempt` `SUCCEEDED` con ese intent/sesión). Sin esto, un reenvío duplicaría el cobro.

Eventos manejados: `checkout.session.completed` (modo `payment` → registra cobro de la factura; modo `subscription` → vincula la `Subscription` interna con la de Stripe, `autoPay=true`), `invoice.paid`/`invoice.payment_succeeded` (por metadata `invoiceId`, o cobro recurrente que genera la siguiente factura del periodo y la marca pagada), `invoice.payment_failed` y `payment_intent.payment_failed` (registran intento `FAILED` y marcan `OVERDUE`), y `customer.subscription.*` (mapean estado Stripe → `ACTIVE`/`PAUSED`/`CANCELED`).

## Links de pago y recordatorios

`createInvoiceCheckoutUrl` (`stripe-checkout.ts`) crea sesiones **mode `payment`** por el importe pendiente (mínimo 50 céntimos), resolviendo `customer`/`customer_email` y aplicando `application_fee` en Connect; cachea la URL en `invoice.stripeCheckoutUrl`. `runReminderJob` envía recordatorios en D-7/D-2/D+1/D+7 por WhatsApp (ApiWass) o webhook, con `ReminderLog` para no duplicar.

## Nota de seguridad

`billing.ts` **no lleva `'use server'`** deliberadamente: sus funciones NO son server actions RPC — solo las invocan, ya autorizadas, las rutas API (`requireRoles`), el webhook (firma) y los crons (Bearer). Tenerlo antes exponía cobros/planes/facturas como endpoints RPC invocables por cualquier cliente autenticado. Ver [[Server actions y seguridad]] y [[Auditoría de seguridad]].

## Relacionado

- [[Contabilidad]]
- [[Motor de workflows]]
- [[Server actions y seguridad]]
- [[Aislamiento entre clubes]]
- [[Resolución de tenant]]
- [[Planes y facturación del portal]]
