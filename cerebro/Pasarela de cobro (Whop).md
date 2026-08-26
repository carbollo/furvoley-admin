---
tags: [whop, pasarela, cobros, payouts, transferencias, idempotencia, marca-blanca, crm]
---

# Pasarela de cobro (Whop)

Pasarela con la que **cada club cobra sus cuotas y recibe su dinero**, en marca blanca: el socio no ve la marca de la pasarela y el club solo entra en whop.com para crear su cuenta y sacar la API key. Sustituye a Stripe (que sigue en el repo pero está en retirada; ver [[Facturación, cuotas y Stripe]]).

Ficheros: `src/lib/whop/client.ts` (HTTP + versionado), `connect.ts` (conexión y permisos), `club-config.ts` (config del club, secretos), `checkout.ts` (enlaces de cobro), `reconcile.ts` (webhook → factura), **`payouts.ts`** (cuenta bancaria y transferencias), **`sweep.ts`** (barrido automático). Rutas: `src/app/api/crm/whop/*`, `src/app/api/whop/webhook/`, `src/app/api/jobs/whop-sweep/`.

## La API tiene dos modelos distintos en la misma URL

La cabecera `Api-Version-Date` decide cuál se sirve. Este proyecto está fijado al modelo **«native»**, que usa `account_id` (`biz_…`); el modelo «stable» usa `company_id` y **expone rutas que aquí no existen**.

> [!warning] No copiar rutas de la doc sin comprobar la versión
> `GET /ledger_accounts/{id}` sale en la documentación pero **solo existe en «stable»**. En «native» el saldo está en **`GET /accounts/{id}` → `balances[]`** (`payouts.ts:355`). Se llegó a escribir código contra la ruta equivocada: habría fallado en cada consulta de saldo, dejando el barrido muerto sin ruido.

## Saldo: `available`, no el total

`balances[]` trae `symbol` y un `breakdown` con **`available`** (transferible ya), `pending` (cobros liquidando), `reserve` (retenido como garantía) e `in_transit`. Los importes llegan como **cadenas decimales**, no como números.

Se transfiere **`breakdown.available`** (`payouts.ts:364`). Usar `balance` (el total) hace que la pasarela **rechace todas las transferencias**, porque incluye dinero que aún no es del club.

## Idempotencia: la regla que ordena todo el módulo

Todo `POST` acepta `Idempotency-Key`. La pasarela guarda la respuesta **24 h** y, al repetir la clave: misma clave + mismo cuerpo → repite la respuesta; misma clave + cuerpo distinto → `400`; misma clave con la primera petición aún en curso → `409`; **los errores 4xx también se repiten**.

De ahí salen dos reglas no negociables:

> [!danger] La clave nunca puede llevar dentro el importe ni la fecha
> Con `…:{día}:{importe}:` un timeout a medianoche generaba **dos transferencias del mismo saldo** (día distinto → clave distinta → segunda ejecución), y un cobro entrante entre la lectura y el reintento hacía lo mismo (importe distinto). Peor aún: dos barridos del mismo día por el mismo importe compartían clave, así que el segundo **repetía la respuesta del primero** y el CRM daba por enviada una transferencia que nunca salió.
>
> Hoy la clave es `crm:sweep:{uuid}`, generada una vez, guardada en `WhopPayout.idempotencyKey` (`@unique`) **antes** del POST (`sweep.ts:184-197`).

> [!danger] Una clave derivada de la *longitud* del contenido es una clave falsa
> `createPayoutMethod` usaba la longitud del JSON de los campos. Todos los IBAN de un país miden lo mismo, así que **cambiar de cuenta devolvía la cuenta anterior** y el dinero seguía yendo al banco viejo mientras la pantalla confirmaba el cambio. Ahora se hashea el contenido (`contentKey`, `payouts.ts:140`), que además permite corregir un dato tras un `400` — si no, el error se repetiría 24 h.

## Barrido (`sweep.ts`): no mover el mismo dinero dos veces

1. **Cerrojo por club** — `whopSweepLockAt` con compare-and-set (`acquireLock`, `sweep.ts:105`), TTL 15 min. Sin él, el cron y el botón «Transferir ahora», o dos usuarios a la vez, leen el mismo saldo y lanzan dos transferencias. El guard `if (busy) return` del componente es **por pestaña**: no protege nada entre sesiones.
2. **Cerrar lo anterior** — `resolvePending` (`sweep.ts:60`) busca filas `SENDING`/`UNKNOWN`, las cruza con la pasarela por `metadata.crm_payout_ref` y las cierra. Si alguna sigue sin aclarar, **no se barre**.
3. **Anotar antes de mover** — se crea la fila `WhopPayout` con su clave, y solo después se pide la transferencia.
4. **Indeterminado ≠ fallido** — un timeout, un 5xx o un 409 dejan el resultado en el aire: se marca `UNKNOWN` y se comprueba, nunca se reintenta a ciegas (`payouts.ts:475`). Solo un 4xx es un rechazo firme.

`whopLastSweepAt` se actualiza **solo cuando se ha movido dinero**: si el club no tenía saldo, no debe esperar otro ciclo entero.

## Divisas: el barrido automático se ciñe a la del banco

`whopPayoutCurrency` guarda la divisa que la pasarela asignó **de verdad** a la cuenta (se relee tras guardarla, no se asume). El barrido automático solo transfiere esa divisa; el resto se reporta como `stranded` y el club lo envía a mano si quiere, asumiendo el cambio de moneda. Nunca se suman divisas distintas en pantalla.

## Cuenta bancaria en marca blanca

`GET /payouts/supported_methods?supported_payout_method_id=…` **declara los campos que pide cada país** (`id` estable `fld_*`, `label`, `required`, `sensitive`, `validation` con regex, `options`). El CRM pinta ese formulario y valida contra esa misma declaración en el servidor (`payouts/methods/route.ts`) — es lo que decide a qué cuenta va el dinero, así que no se envía nada fuera de la lista.

`syncDefaultPayoutMethod` (`payouts.ts:319`) autocura el caso «guardada en la pasarela pero no en el CRM»: sin eso, el barrido diría «sin cuenta bancaria» para siempre mientras el club ve su cuenta en pantalla.

## Cosas que no se hacen y por qué

- **No se reenvía `e.message` de la pasarela al navegador** (`friendly`, `payouts.ts:85`): va en inglés y puede llevar dentro el dato bancario que causó el error.
- **No se vuelca el error entero al log** (`logSafe`, `payouts.ts:124`): `WhopError` expone `body` como propiedad propia y la pasarela repite ahí el valor rechazado — un IBAN acabaría en los logs en claro.
- **Los datos bancarios no se guardan en la BD del club**: solo el identificador opaco `potk_…`.
- **`payouts.ts` y `sweep.ts` no llevan `'use server'`**: mueven dinero y quedarían expuestos como RPC sin auth. Ver [[Server actions y seguridad]].

## Cron `/api/jobs/whop-sweep`

Bearer `CRON_SECRET`, `forEachTenant` (ver [[Aislamiento entre clubes]]). Tiene **presupuesto de tiempo** (600 s) y devuelve `truncated` + `deferred` con los clubes que no dio tiempo a procesar; el recorrido **rota cada día** (`forEachTenant(..., { rotateBy })`) porque el orden por slug es fijo y, sin rotar, los mismos clubes del final quedarían sin barrer siempre.

## Relacionado

- [[Facturación, cuotas y Stripe]]
- [[Aislamiento entre clubes]]
- [[Server actions y seguridad]]
- [[Operaciones, entorno y convenciones]]
- [[Motor de workflows]]
