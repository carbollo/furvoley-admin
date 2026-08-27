---
tags: [whop, pasarela, cobros, payouts, transferencias, idempotencia, marca-blanca, crm]
---

# Pasarela de cobro (Whop)

Pasarela con la que **cada club cobra sus cuotas y recibe su dinero**, en marca blanca: el socio no ve la marca de la pasarela y el club solo entra en whop.com para crear su cuenta y sacar la API key. Sustituye a Stripe (que sigue en el repo pero está en retirada; ver [[Facturación y cuotas]]).

Ficheros: `src/lib/whop/client.ts` (HTTP + versionado), `connect.ts` (conexión y permisos), `club-config.ts` (config del club, secretos), `checkout.ts` (enlaces de cobro), `reconcile.ts` (webhook → factura), **`payouts.ts`** (cuenta bancaria y transferencias), **`sweep.ts`** (barrido automático), **`cards.ts`** (tarjetas). Rutas: `src/app/api/crm/whop/*`, `src/app/api/whop/webhook/`, `src/app/api/jobs/whop-sweep/`.

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

## Dónde lo ve el club: Contabilidad → Banco

`src/components/crm/BancoSection.tsx` (sección `banco`, solo ADMIN y TREASURER en `rbac.ts`) reúne saldos, cuenta bancaria, programación del barrido, «Transferir ahora», historial y el acceso al extracto. El panel en sí es `PayoutsPanel.tsx`.

Antes vivía **dentro del modal de Ajustes del club**, donde nadie busca su dinero; ahí queda solo conectar la pasarela y un puntero. Si tocas esto, el modal y la sección no deben volver a tener cada uno su copia del panel.

`/api/crm/data` expone `club.country` (decide qué campos bancarios pide `supported_methods`) y `club.whopConectado` (sin ello la sección no puede distinguir «no conectado» de «error al cargar» y pediría saldos que nunca llegan).

## Tarjetas (`cards.ts`)

El club gasta su saldo con una Visa en vez de esperar la transferencia. `src/lib/whop/cards.ts` + rutas `src/app/api/crm/whop/cards/…` + `CardsPanel.tsx` dentro de Banco.

**Cuatro trampas, todas comprobadas contra el OpenAPI (`x-api-version-date: 2026-08-25-2`):**

1. **`POST /cards` tiene CUATRO formas de respuesta, no tres.** Además de `card` (201), `card_provisioning` y `card_invitation`, existe **`card_application`** (202): la pasarela aún no ha aprobado al club y abre una solicitud con `hosted_url`, que es la **única** vía para completarla. Tres de las cuatro traen `id`, así que discriminar por «tiene id» confundía una solicitud (`ciac_…`) con una tarjeta emitida (`icrd_…`) y tiraba el enlace. Se discrimina **siempre por `object`**, y el aviso de la solicitud se queda fijo en pantalla, no en un `showAlert` que se esfuma.
2. **`spent_last_month` viene en CÉNTIMOS; `limit.amount`, en DÓLARES.** `mapCard` normaliza a dólares. Comparar los dos crudos da un error de 100×.
3. **La tarjeta liquida en USD y el club lleva EUR.** No se convierte nada: se enseña `local_amount`+`currency` (lo que cobró el comercio) y debajo `usd_amount` (lo que se descontó). Pintar un importe de tarjeta con «€» es mentirle al club.
4. **La clave de idempotencia se deriva del `requestId` del navegador + el contenido**, no de «cuántas tarjetas hay». Con el recuento, cancelar una tarjeta y reemitirla igual —justo lo que toca si te la clonan— repetía la clave y la pasarela devolvía la tarjeta cancelada. Y como la pasarela repite también las respuestas de **error** 24 h, el navegador renueva el `requestId` tras cada fallo.

**El número completo y el CVC** salen solo por `getCardSecrets` (`GET /cards/{id}`), que descarta el resto de la respuesta; ruta aparte, solo ADMIN, `no-store`, sin log (`logSafe` de este módulo solo registra el status: el cuerpo del error puede llevar el PAN), y nunca en la BD. `mapCard` es una lista blanca, así que un `secrets` en la respuesta de lista no llegaría al navegador.

**Permisos:** leer usa `payout:account:read`, que ya está en `WHOP_REQUIRED_SCOPES`. Emitir/congelar pide `payout:account:update` y `company:authorized_user:read`, que van aparte en `WHOP_CARD_SCOPES` **a propósito**: meterlos en los obligatorios haría que todos los clubes ya conectados vieran «faltan permisos» por algo que no usan.

**Gap conocido:** las rutas `/api/crm/whop/*` (tarjetas y también las de cobro, que ya estaban así) no pasan por `assertModuleForRequest`, así que no se gatean por plan. Requiere sesión de ADMIN/tesorero del club, pero es una incoherencia con el menú.

## Trampa: hooks después de un `return` condicional

`ClubSettingsModal` tenía `if (!open) return null` y, 150 líneas más abajo, un `useCallback`. Con el modal cerrado React veía N hooks; al abrirlo veía N+1 y tumbaba **la aplicación entera** con «Rendered more hooks than during the previous render» — pantalla en blanco con «This page couldn't load», sin una sola línea en los logs del servidor porque el fallo es del navegador.

Estuvo así desde que se añadieron los pagos al modal y no se vio hasta que un botón nuevo invitó a abrirlo.

`CrmApp.tsx` tiene ~150 avisos del mismo tipo (`if (role !== 'ADMIN') return null` seguido de hooks). Hoy **no estallan** porque el padre decide con el mismo `role` si esa sección se monta siquiera (`safeActive = canShow(active) ? … `, `CrmApp.tsx:9743`): la guarda no puede cambiar mientras el componente vive. Es una red de seguridad indirecta, no una garantía — si alguien desacopla ese cálculo del rol, estallan todas a la vez.

Para revisarlo: `react-hooks/rules-of-hooks` de ESLint los encuentra todos. `npm run build` **no** pasa el linter, así que no avisa.

## Cosas que no se hacen y por qué

- **No se reenvía `e.message` de la pasarela al navegador** (`friendly`, `payouts.ts:85`): va en inglés y puede llevar dentro el dato bancario que causó el error.
- **No se vuelca el error entero al log** (`logSafe`, `payouts.ts:124`): `WhopError` expone `body` como propiedad propia y la pasarela repite ahí el valor rechazado — un IBAN acabaría en los logs en claro.
- **Los datos bancarios no se guardan en la BD del club**: solo el identificador opaco `potk_…`.
- **`payouts.ts` y `sweep.ts` no llevan `'use server'`**: mueven dinero y quedarían expuestos como RPC sin auth. Ver [[Server actions y seguridad]].

## Cron `/api/jobs/whop-sweep`

Bearer `CRON_SECRET`, `forEachTenant` (ver [[Aislamiento entre clubes]]). Tiene **presupuesto de tiempo** (600 s) y devuelve `truncated` + `deferred` con los clubes que no dio tiempo a procesar; el recorrido **rota cada día** (`forEachTenant(..., { rotateBy })`) porque el orden por slug es fijo y, sin rotar, los mismos clubes del final quedarían sin barrer siempre.

## Relacionado

- [[Facturación y cuotas]]
- [[Aislamiento entre clubes]]
- [[Server actions y seguridad]]
- [[Operaciones, entorno y convenciones]]
- [[Motor de workflows]]
