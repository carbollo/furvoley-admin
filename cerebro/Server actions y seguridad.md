---
tags: [server-actions, seguridad, rpc, next-js, autorizacion, multitenant]
---

# Server actions y seguridad

## La clase sistémica: `'use server'` = endpoint RPC público

En Next.js App Router, **todo fichero con la directiva `'use server'` en la cabecera convierte CADA función exportada en un endpoint RPC** al que cualquier cliente puede llamar por su ID, saltándose por completo la UI. Que un botón solo se pinte para un ADMIN **no protege nada**: el navegador conoce el identificador del action y puede invocarlo con los argumentos que quiera.

De aquí salió una clase entera de hallazgos en la [[Auditoría de seguridad]]: varios ficheros `'use server'` exponían mutaciones sensibles **sin comprobar rol**. Casos concretos:
- **`deleteMember`** (borrado en cascada de socio + pagos + facturas + asistencias) era invocable por cualquier usuario autenticado.
- **`createMember` / `updateMember`**, cobros, facturas, planes, suscripciones, importación bancaria, productos de tienda: todos alcanzables como RPC crudo.
- **`getMetaConfig`** llegaba a **filtrar el `accessToken` de Meta Ads** a cualquier sesión.

Dos peligros se combinan: (1) falta de **autorización** (rol) y (2) el action **no hereda el tenant** del render de la página, así que sin `runWithTenant` puede quedar apuntando a una BD equivocada (ver [[Resolución de tenant]] y [[Aislamiento entre clubes]]).

## Patrón de fix A: quitar `'use server'` (mover a módulo de servidor)

Si a una función **solo la llaman rutas API, crons, webhooks, workflows o Hermes** (que ya autorizan por su cuenta), la solución es **eliminar la directiva** y dejar un módulo de servidor normal. Al no ser `'use server'`, deja de existir como endpoint RPC: solo es importable server-to-server.

Ficheros movidos a este patrón (todos con un comentario de cabecera que **avisa de no volver a añadir `'use server'`**):
- **`src/lib/members-service.ts`** — `createMember/updateMember/deleteMember`. Lo llaman `api/crm/members/**` (tras `requireRoles`), el import CSV (`members-bulk-import`), las acciones en lote (`members-batch-actions`) y la tool MCP de Hermes (Bearer). Ver [[Alta automática por webhook]].
- **`src/lib/events-service.ts`** — `createEventInternal/updateEventInternal/deleteEventInternal/updateAttendanceInternal`. Lo consumen las rutas `api/crm/events/**`, la ruta pública por token `api/public/workflow-response/[token]` (con su propia auth) y los wrappers de `app/actions/events.ts`. Ver [[Eventos y asistencia]].
- **`src/app/actions/billing.ts`** — cobros, planes, suscripciones, facturas. Llamado por rutas API, el webhook de Stripe (firma), los crons (`forEachTenant`) y los workflows. Ver [[Facturación, cuotas y Stripe]].
- **`src/app/actions/workflows.ts`** — `setWorkflowActive`, solo desde `api/crm/workflows/[id]/toggle` (con gate de módulo). Ver [[Motor de workflows]].
- **`src/app/actions/leads.ts`** — `createLead/updateLead`; superficie muerta sin llamadores, se neutralizó quitando la directiva.

**Clave:** la lógica queda en un módulo **sin auth propia** porque asume un llamador ya autorizado. El riesgo se traslada a garantizar que **ningún caller salte la autorización**.

## Patrón de fix B: mantener `'use server'` con wrapper (auth + tenant)

Cuando el action **sí** lo necesita un componente cliente, se conserva `'use server'` pero **cada función exportada** debe hacer dos cosas antes de tocar datos:

1. **`runWithTenant(async () => { ... })`** — activa la BD del club por host (el action no hereda el tenant del render).
2. **`await assertXxx()`** — comprueba rol con `getServerSession(authOptions)` + `normalizeRole`, lanzando `No autorizado` si falla. Ver [[Autenticación y sesiones]] y [[RBAC y módulos]].

Ficheros con este patrón y su gate:
- **`src/app/actions.ts`** — contabilidad, pagos, recordatorios WhatsApp → `assertAccountingStaff()` (**ADMIN o TREASURER**).
- **`src/app/actions/bank-import.ts`** — conciliación bancaria → `assertAccountingStaff()` (**ADMIN/TREASURER**).
- **`src/actions/store.ts`** — tienda → `assertStoreAdmin()` (**ADMIN**); única lectura pública: escaparate de productos ACTIVOS.
- **`src/actions/meta.ts`** — Meta Ads (maneja secretos) → `assertMetaAdmin()` (**ADMIN**).
- **`src/app/actions/events.ts`** — wrapper fino: `assertEventWriter(groupId)` (**ADMIN, o COACH solo de su equipo**) y luego delega en `events-service`.
- **`src/actions/events.ts`** — variante autónoma con `assertEventStaff` (mismo criterio ADMIN/COACH-de-equipo); ojo, **coexisten dos `createEvent`** en rutas distintas.
- **`src/app/actions/signup-links.ts`** — `createSignupLink` exige **ADMIN/COACH**; `submitSignupFromLink` se autoriza **por token** de enlace (alta pública), no por sesión.

## Gotchas

- **La UI no es una frontera de seguridad.** Nunca dejes un `'use server'` confiando en que "solo el admin ve el botón".
- **Un action nunca hereda el tenant.** Sin `runWithTenant`, el proxy `@/lib/prisma` puede resolver la BD equivocada o ninguna → fuga o error entre clubes ([[Aislamiento entre clubes]]).
- **Autorización granular, no solo por rol:** COACH se valida además contra `groupMembership` (que sea coach *de ese* equipo), no basta el rol global.
- **Lecturas también son RPC.** Un `get*` en `'use server'` es un endpoint: `getEventById` es lectura pública pero **acotada por tenant**; los `get*` de gestión (tienda, meta, bank-import) exigen rol.
- **El patrón B repite `runWithTenant + assert` en cada función**: es intencional (defensa en profundidad), no lo factorices fuera del cuerpo del action.
- **Al añadir un nuevo action**, decide primero: ¿lo llama el cliente? Sí → patrón B. No → patrón A (módulo sin directiva). No dejes lógica sensible en `'use server'` "por si acaso".

## Relacionado

- [[Auditoría de seguridad]]
- [[Autenticación y sesiones]]
- [[RBAC y módulos]]
- [[Resolución de tenant]]
- [[Aislamiento entre clubes]]
- [[Facturación, cuotas y Stripe]]
