---
tags: [facturacion, cuotas, suscripciones, crm, multitenant, cron, idempotencia]
---

# Facturación y cuotas

Módulo de **ingresos del CRM del club** (no confundir con la facturación del portal a los clubes, que vive en [[Planes y facturación del portal]]). Facturas, planes de socio, suscripciones recurrentes, cobros y recordatorios. Todo corre **dentro de la BD del tenant activo** (proxy `@/lib/prisma`, ver [[Resolución de tenant]] y [[Arquitectura Modelo C]]).

La pasarela con la que se cobra vive aparte: ver [[Pasarela de cobro (Whop)]].

Ficheros clave: `src/lib/crm-invoice-create.ts` (numeración), `src/app/actions/billing.ts` (lógica central), `src/lib/billing-dates.ts` (fechas de cobro), `src/lib/payments/invoice-checkout.ts` (enlaces de pago) y los crons `src/app/api/jobs/billing*`.

## Estados de una cuota

`ACTIVE | PENDING_PAYMENT | PAUSED | CANCELED`, definidos en `src/lib/subscription-statuses.ts` junto con los conjuntos que usa cada pantalla. Una cuota que exige pago al alta **nace `PENDING_PAYMENT` y no pasa a `ACTIVE` hasta que el cobro se confirma** (o hasta que un admin la marca a mano). Las que no exigen pago nacen activas, o su facturación recurrente se quedaría congelada.

> [!tip] Comparar siempre contra el mismo conjunto
> «Socios con cuota» lista `SUBSCRIPTION_VISIBLE` (incluye `PAUSED`), así que «socios sin cuota» tiene que excluir **ese mismo** conjunto. Comparando contra `SUBSCRIPTION_ACTIVE_LIKE`, un socio en pausa salía en las dos listas a la vez.

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

`nextInvoiceDate` marca cuándo toca la próxima cuota; `autoPay` indica que la pasarela la cobra sola (`whopMembershipId` guarda la suscripción del socio allí). `createSubscription`:

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
- **Política contable:** los cobros **por la pasarela NO generan `Transaction`/`JournalEntry`** — ese dinero llega a la cuenta de la pasarela y solo entra en el banco del club al transferirse, así que la contabilidad oficial se llena desde el CSV bancario (conciliación). En cambio, `CASH` y `BANK_TRANSFER` (cobros manuales que no pasan por el extracto) **sí** crean asiento de inmediato. Ver [[Contabilidad]].

> [!note] `'STRIPE'` sigue excluido del asiento automático
> La pasarela anterior está retirada y ya nadie produce ese método, pero las filas históricas existen. Si un reproceso tocara una, crearía un asiento que ya se concilió en su día.

## Links de pago y recordatorios

Todos los enlaces de cobro salen de **`createInvoiceCheckoutUrl`** (`src/lib/payments/invoice-checkout.ts`), el único punto que habla con la pasarela; `billing.ts` lo envuelve en `createInvoicePaymentLink`. El enlace se cachea en `invoice.whopCheckoutUrl`, pero **solo se reutiliza si sigue valiendo lo que se debe**: uno viejo cobraría el importe de antes del último pago parcial.

`runReminderJob` envía recordatorios en D-7/D-2/D+1/D+7 por WhatsApp (ApiWass) o webhook, con `ReminderLog` para no duplicar.

> [!warning] Retirar una pasarela es también retirar sus enlaces
> Al quitar Stripe se dejó de leer `invoice.stripeCheckoutUrl` en todo el motor de workflows. La columna sigue ahí como histórico, pero usarla como respaldo habría mandado a los socios a un checkout muerto.

## Nota de seguridad

`billing.ts` **no lleva `'use server'`** deliberadamente: sus funciones NO son server actions RPC — solo las invocan, ya autorizadas, las rutas API (`requireRoles`), el webhook (firma) y los crons (Bearer). Tenerlo antes exponía cobros/planes/facturas como endpoints RPC invocables por cualquier cliente autenticado. Ver [[Server actions y seguridad]] y [[Auditoría de seguridad]].

## Relacionado

- [[Contabilidad]]
- [[Motor de workflows]]
- [[Server actions y seguridad]]
- [[Aislamiento entre clubes]]
- [[Resolución de tenant]]
- [[Planes y facturación del portal]]
