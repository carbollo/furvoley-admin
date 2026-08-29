---
tags: [contabilidad, partida-doble, pgc, conciliacion-bancaria, asientos, iva, crm-tenant]
---

# Contabilidad

Módulo de **contabilidad de doble partida** (PGC español) que vive dentro de la BD de cada club (ver [[Aislamiento entre clubes]] y [[Resolución de tenant]]): todas las tablas y consultas usan el proxy `@/lib/prisma`, así que cada asiento queda en `tenant_<slug>`. El núcleo es `src/lib/accounting/engine.ts`; la API REST cuelga de `src/app/api/crm/accounting/*` y la conciliación bancaria de `src/app/actions/bank-import.ts`.

## Modelo de datos

En `prisma/schema.prisma`:

- **`AccountChart`** — plan de cuentas (PGC). `code` único (p. ej. `5700000`), `nature` (`ASSET`/`LIABILITY`/`EQUITY`/`INCOME`/`EXPENSE`), `level` 1-8, `isActive`. `nature` es la clave de todos los informes.
- **`JournalEntry`** — cabecera del asiento. `entryNumber` **único** (`A-YYYY-NNNNNN`), `status` (`DRAFT`/`POSTED`/`REVERSED`), `source` (`MANUAL`/`INVOICE`/`PAYMENT`/`ADJUSTMENT`/`SYSTEM`), `sourceId` (traza al origen), `reversalOfId`, y FK a `FiscalPeriod` con `onDelete: Restrict`.
- **`JournalLine`** — línea con `side` (`DEBIT`/`CREDIT`), `amount` (Float), `accountId` (con `onDelete: Restrict`: no se puede borrar una cuenta con movimientos), `memberId` y `costCenter` opcionales. Cascade al borrar el entry.
- **`FiscalPeriod`** — periodo mensual `YYYY-MM` con `isClosed`.
- **`BankImport` / `BankStatementLine`** — extractos importados y sus líneas.
- **`TaxConfig`** — fila única (`@@unique([isDefault])`) con tipos de IVA y retención por defecto para ingresos/gastos/facturas.

## Motor: `engine.ts`

`createJournalEntry()` es la **única puerta** para escribir en el libro; todos los llamadores (API, movimientos, reversiones, backfill, facturación) pasan por aquí. Validaciones en orden:

1. **Allowlist estricta de `side`**: cualquier valor fuera de `DEBIT`/`CREDIT` se rechaza *antes* de sumar. El gotcha documentado en el código: `sum()` filtra por side, así que un side inválido no se sumaría y colaría un asiento descuadrado que corrompería libro e informes.
2. **Cuadre**: Debe y Haber deben ser `> 0` y coincidir con tolerancia `0.0001`.
3. **Periodo**: `ensureFiscalPeriod()` hace upsert del mes; si `isClosed` **rechaza** contabilizar.
4. **Cuentas**: todos los `accountCode` deben existir y estar activos.

**Numeración `max+1` con reintento** (no `count`): `entryBaseSeq()` deriva el número del `max(entryNumber)` del año, **no** del recuento de filas. Motivo: borrar un asiento intermedio no debe hacer que el siguiente número colisione con uno ya usado. El formato de ancho fijo `A-YYYY-NNNNNN` garantiza que el orden lexicográfico == numérico. Como es `prisma.create` sin transacción compartida, ante colisión de unicidad (`P2002`, concurrencia) reintenta hasta 5 veces recalculando el número.

`reverseJournalEntry()` crea un asiento espejo (`source: SYSTEM`, `sourceId` = original) invirtiendo cada line (`DEBIT`↔`CREDIT`), y marca el original `REVERSED` con `reversalOfId`. Solo revierte asientos `POSTED`.

## Plan de cuentas base (`pgc.ts`)

`ensureBasePgcAccounts()` hace upsert idempotente de ~12 cuentas PGC mínimas (caja `5700000`, bancos `5720000`, clientes `4300000`, ventas `7000000`, compras/servicios `6xx`, y las de Hacienda: IVA soportado `4720000`, IVA repercutido `4770000`, retenciones `4730000`/`4751000`). Se invoca perezosamente al listar cuentas o crear movimientos, así que un club recién creado siempre tiene el PGC mínimo.

## Movimientos manuales (`movements/route.ts`)

Alta simplificada ingreso/gasto que **calcula el asiento de partida doble automáticamente** a partir de una cuenta de tesorería + una de categoría:

- La cuenta de pago debe ser del grupo **57/56** (caja o bancos); la contrapartida debe casar en `nature` (INCOME para ingresos, EXPENSE para gastos).
- Calcula IVA y retención según `TaxConfig` (o overrides del body): genera líneas extra en `4770000`/`4720000` (IVA) y `4730000`/`4751000` (retención). `netTreasury = total − retención`.
- **Atomicidad por compensación**: crea primero un `Transaction` y luego el asiento. Como `createJournalEntry` usa el `prisma` global (no una tx compartida), si el asiento falla, **borra la `Transaction`** en el catch para no dejar un movimiento de tesorería huérfano sin partida doble.
- El `DELETE` solo permite borrar movimientos `source: MANUAL`, y lo hace en `prisma.$transaction` borrando lines + entry + transaction juntos.

## Conciliación bancaria (`bank-import.ts`)

**Server actions** (RPC invocados desde cliente/RSC): cada una envuelve en `runWithTenant` (activa la BD del club por host, ver [[Resolución de tenant]]) y exige rol `ADMIN`/`TREASURER` vía `assertAccountingStaff()`. Este gate se añadió en la [[Auditoría de seguridad]]: antes ninguna comprobaba auth y cualquier usuario autenticado podía importar/borrar extractos (patrón sistémico descrito en [[Server actions y seguridad]]).

Flujo: `importBankCsv` parsea el CSV (`parseBankCsvContent`) y crea un `BankImport` con líneas `PENDING`. Cada línea puede:
- **Conciliarse** con un `Transaction` existente (`reconcileBankLine`) — valida importe (tolerancia `0.02`) y que ingreso/gasto encaje; estado `MATCHED`. `getSuggestedTransactionsForLine` sugiere candidatos por importe ±0.02 y fecha ±10 días, excluyendo los ya usados.
- **Generar un asiento nuevo** (`createLedgerFromBankLine`) — crea un `Transaction` (`source: BANK_CSV_IMPORT`); estado `NEW_LEDGER`.
- **Ignorarse** / **desvincularse** (`ignoreBankLine` / `unlinkBankLine`).

`signedAmount > 0` = ingreso en la cuenta del club, `< 0` = cargo.

## Informes (`reports/route.ts`)

Recorre las `JournalLine` del rango de fechas y agrega por cuenta para producir en una sola pasada:
- **Balance de sumas y saldos** (trial balance): debe/haber por cuenta.
- **PyG**: cuentas `INCOME`/`EXPENSE` con saldo según naturaleza.
- **Balance de situación**: activo (`debit−credit`), pasivo y patrimonio (`credit−debit`).

Todo derivado de `nature`, de ahí la importancia de clasificar bien cada cuenta.

## Periodos, tax-config y backfill

- `periods/route.ts` y `periods/[id]/route.ts`: listar/crear periodos y **cerrar** (`isClosed`) — un periodo cerrado bloquea nuevos asientos en el engine.
- `tax-config/route.ts`: GET/PUT de la fila única `TaxConfig` (IVA 0-100, retención 0-100).
- `backfill.ts`: genera asientos históricos desde `Transaction` preexistentes; es **idempotente** (aborta si ya hay entries `PAYMENT`/`ADJUSTMENT`).

La contabilidad también se alimenta automáticamente desde facturas y cobros (`src/app/actions/billing.ts` llama a `createJournalEntry`), ver [[Facturación y cuotas]].

## Seguridad y gotchas

- **RBAC**: todas las rutas API exigen `ADMIN`/`TREASURER` vía `requireRoles` (ver [[RBAC y módulos]]); las server actions con `assertAccountingStaff`. El `catch` traduce a `401`.
- **Sin transacción global en el engine**: la partida doble (Transaction ↔ asiento) no comparte una BD-transaction; la atomicidad se logra por **compensación manual** (borrar en el catch) y por reintento en la numeración.
- **`Float` para importes**: el cuadre usa tolerancias (`0.0001`, `0.02`) precisamente por el redondeo de coma flotante.
- **`onDelete: Restrict`** en cuentas y periodos impide borrados que dejarían el libro inconsistente.

## Relacionado

- [[Facturación y cuotas]]
- [[Server actions y seguridad]]
- [[RBAC y módulos]]
- [[Resolución de tenant]]
- [[Aislamiento entre clubes]]
- [[Auditoría de seguridad]]

## Criterio: DEVENGO (decidido en agosto de 2026)

El apunte nace al **emitir** la factura, no al cobrarla:

```
Emisión   DEBE 4300000 Clientes (total)      HABER 7050000 base + 4770000 IVA
          DEBE 4730000 retención (si la hay)
Cobro     DEBE 5700000/5720000 tesorería     HABER 4300000 Clientes
```

Antes solo existía el segundo. Consecuencia: «Resultado del año: 0 €» habiendo facturado treinta mil, las cuotas fuera de la cuenta de resultados, y **Clientes con saldo negativo** en el balance porque solo se abonaba y jamás se cargaba.

El asiento de emisión lo pone `src/lib/accounting/invoice-accrual.ts`, es **idempotente** (por `source: 'INVOICE_ISSUED'` + `sourceId`) y lo llaman los **tres** sitios que crean facturas. Si falla —periodo cerrado, por ejemplo— la factura se emite igual y el fallo se registra: un mes cerrado no puede impedirle facturar al club.

`Invoice.withholdingAmount` es columna desde este cambio. Antes se deducía restando (`subtotal + IVA − total`), y cualquier descuadre se convertía en una «retención» que nadie había aplicado; además, sin guardarla no se podía asentar el devengo cuando la había.

## Anular una factura

Dos caminos, y el que toca depende de si el documento salió del club:

- **Anulación simple** — solo si no tiene cobros. Marca `VOID` y revierte el asiento de emisión.
- **Rectificativa** — emite una factura de abono con su propio número e importes en negativo, y su asiento invertido. La original **no se toca**, que es lo que exige Hacienda.

`POST /api/crm/invoices/[id]/void` con `{ modo, motivo }`. El motivo es obligatorio y se guarda en `Invoice.notes`.

Antes esto no existía y varios mensajes de error del propio CRM mandaban a hacerlo.

## Anular un asiento manual

`reverseJournalEntry` crea el contra-asiento **y** un movimiento de tesorería compensatorio cuando el asiento nació de uno manual. Sin eso, el Libro volvía a cuadrar pero el Sumario, los Informes y el CSV seguían contando el dinero: se anulaba un gasto de 800 € y se seguía viendo en «Gastos totales». Se compensa, no se borra: un libro no se corrige borrando, y además borrar el movimiento dejaría líneas del extracto conciliadas contra algo que ya no existe.

## El recálculo contable no duplica

`backfillLedgerFromTransactions` se salta movimiento a movimiento, por la **referencia** `TX:<id>` y por si su factura ya tiene asiento de cobro. La guarda anterior era «¿hay algún asiento de cobro o ajuste?», y un club que registra sus ingresos a mano no tenía ninguno: el recorrido volvía a pasar por todo y **duplicaba los gastos** en el libro.
