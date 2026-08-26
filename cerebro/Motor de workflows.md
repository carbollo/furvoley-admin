---
tags: [motor-workflows, automatizaciones, whatsapp, branch-if, idempotencia, seguridad, multi-tenant]
---

# Motor de workflows

El **motor de automatizaciones** ejecuta flujos (`Workflow` + `WorkflowStep[]`) guardados en la BD del **tenant activo**: un *trigger* dispara N pasos ordenados que envían WhatsApp, crean facturas/cobros, asignan equipos, ramifican, etc. Todo corre sobre `@/lib/prisma`, que ya enruta a la BD del club por [[Resolución de tenant]], así que el motor nunca ve más de un club a la vez.

Ficheros clave: `src/lib/workflow-engine.ts` (núcleo + acciones base), `src/lib/workflow-engine-more.ts` (acciones extendidas), `src/lib/workflow-proclub-runners.ts` (runners programados/por-cron y de contexto especial), `src/lib/crm-workflow-triggers.ts` y `crm-workflow-actions.ts` (catálogos + allowlists).

## Triggers (disparadores)

- El union `WorkflowTriggerType` define ~50 tipos: `MEMBER_CREATED`, `TEAM_ROSTER_CONFIRMED`, `INVOICE_CREATED/PAID/OVERDUE`, `PAYMENT_*`, `EVENT_*`, `ATTENDANCE_ABSENT_UNEXCUSED`, `BILLING_CYCLE_DUE`, `WAITLIST_SLOT_AVAILABLE`, `DOCUMENT_EXPIRING`, `CONVOCATION_PUBLISHED`, etc. El catálogo con etiquetas (y la `allowlist` de validación) vive en `crm-workflow-triggers.ts`.
- **Matching flexible**: `workflowMatchesTrigger` acepta que un workflow coincida por `triggerType` exacto **o** porque el evento esté en `triggerConfig.eventKinds[]` (un flujo escuchando varios eventos).
- **Filtro fino de estado**: para `MEMBER_STATUS_CHANGED`, `memberStatusChangeMatches` (`workflow-trigger-config.ts`) descarta el flujo salvo que casen `onlyWhenCurrentStatus` / `onlyWhenPreviousStatus`.
- **Invocación**: cada evento tiene su `runXxxWorkflows(entityId)` (p. ej. `runMemberCreatedWorkflows`, `runInvoiceOverdueWorkflows`) que carga la entidad, la mapea a un `WorkflowMemberPayload` y llama a `runWorkflowsForMemberByTrigger`. Los disparan `members-service.ts`, `actions/signup-links.ts`, y los crons de `api/jobs/*` (p. ej. `billing-cycle`).
- **Sujetos no-socio**: leads corren como **pseudo-socio** (`leadAsMember`, `status: 'LEAD'`); eventos y cambios de horario usan *stub members* con `id: 'event'` / `'schedule'` (algunas acciones, como `GENERATE_RESPONSE_LINK`, detectan estos ids para no pasar un `memberId` falso).

## Actions (acciones) y ejecución de pasos

- **Dos capas de acciones**: `runWorkflowStepsForMember` llama por paso a `runMemberCreatedStepAction`, que **primero** delega en `runExtendedWorkflowAction` (`workflow-engine-more.ts`); si esa devuelve `true` el paso ya se resolvió. Las base cubren asignación de equipo, `SET_MEMBER_*`, `CREATE_PAYMENT/TRANSACTION`, `SEND_WHATSAPP`, `HTTP_REQUEST`; las extendidas cubren facturación/Stripe (`CREATE_SUBSCRIPTION`, `CREATE_INVOICE_FROM_PLAN`, `SEND_PAYMENT_LINK`, `APPLY_DISCOUNT_RULES`), envíos a equipo/entrenador y `TRIGGER_WAITLIST_NOTIFY`. La allowlist está en `crm-workflow-actions.ts`.
- **runContext.variables**: mapa `string→string` que arranca con `defaultWorkflowVariables()` + `buildTriggerVariables()` (datos del socio, pago, factura, evento, teléfono del club…). Cada acción escribe resultados (`stepApplied`, `stepError`, `assignedTeamId`, `invoiceId`, `paymentUrl`, `signupLinkUrl`…) que los pasos siguientes pueden **interpolar** en plantillas con `{token}`, `{{token}}` o `(token)` vía `interpolateHttpTemplate`.
- **Variables por nodo**: tras cada paso, `snapshotNodeScopedVariables` copia el estado a claves `node_<stepKey>_<var>` para que un paso pueda leer la salida concreta de otro.
- **Reporte**: el callback opcional `onStepComplete` emite un `WorkflowStepRunReport` por paso (posición, acción, `applied`, `branchResult`, `error`) — es lo que alimenta el modo "Probar" del editor.
- **HTTP_REQUEST endurecido**: `isAllowedHttpUrl` sólo permite `https:` (o `http:` a `localhost/127.0.0.1`) como guarda anti-SSRF, se puede desactivar globalmente con `WORKFLOW_HTTP_DISABLED`, tiene timeout de 15 s y trunca la respuesta a 500 chars. Ver [[Auditoría de seguridad]].

## BRANCH_IF y el guard anti back-edge

- **`BRANCH_IF` es un paso *puro*** (sin efectos): `evalBranchCondition` compara un campo (`member.age`, `member.status`, `member.extra.*`, `trigger.currentStatus`…) con `ifValue` (también interpolable) según `ifOperator` (`eq/ne/lt/gt/contains`…). Escribe `stepBranchResult = then|else` y salta al paso destino `thenTargetKey`/`elseTargetKey`, resuelto por `resolveStepIndex` (por `stepKey`, o por `label` en flujos antiguos).
- Como un branch puede **saltar hacia atrás**, el bucle podría reejecutar pasos indefinidamente. Dos defensas:
  1. **Cota dura**: `maxIter = max(steps.length*25, 50)` iteraciones; si se agota, se corta con un warning.
  2. **Guard anti back-edge por efectos**: un `Set<number> sideEffectDone` marca la *posición* de cada paso con efectos ya ejecutado. `isSideEffectAction` (regex `^(SEND_|CREATE_|APPLY_|TRIGGER_|ASSIGN_|UPDATE_|DELETE_|ENROLL_|CHARGE_|MARK_|HTTP_|GENERATE_|CANCEL_|RETRY_)`) decide qué es "con efectos". **Cada paso con efectos se ejecuta como mucho una vez por run**; los pasos puros (BRANCH_IF, `SET_*`) sí pueden re-evaluarse. Así un bucle que vuelve atrás **no** reenvía un WhatsApp ni vuelve a crear un cobro.

## SEND_WHATSAPP: sin fuga a member.phone

- El destino se toma de la plantilla `waPhone` (por defecto `{memberPhone}`), interpolada y limpiada a `[\d+]`. El punto delicado: la variable `memberTargeted` sólo es `true` si la plantilla menciona `member` o `guardian`.
- **Sólo si `memberTargeted`** se permite el *fallback* a `member.phone` (o a `guardianPhone` cuando la plantilla apunta al tutor). Si la plantilla apunta a un teléfono **no-socio** (`{clubAdminPhone}`, `{coachPhone}`…) y resuelve vacío, el teléfono se deja vacío y el paso marca error **sin enviar** — evita filtrar al socio un mensaje interno dirigido al club o al entrenador.
- Los envíos a colectivo (`SEND_WHATSAPP_TO_TEAM` / `SEND_WHATSAPP_TO_COACH`, en `workflow-engine-more.ts`) resuelven destinatarios por **membresía efectiva del grupo** (`effectiveGroupMemberIds` / `getEffectiveGroupMembers`, incluye subgrupos por contención) y usan `guardianPhone || phone`. La sesión de WhatsApp sale de `getWhatsAppConfig().linkedSessionId` si el paso no la fija.

## Idempotencia de descuentos

`APPLY_DISCOUNT_RULES` recalcula el descuento sobre la factura de contexto (`invoiceId`). Cuenta *hermanos* (`ruleType: 'SIBLING'`) como socios `ACTIVE` distintos que comparten `phone`/`guardianPhone` y toma el mayor `percent`. **Clave de idempotencia**: antes de aplicar, revisa los `items` de la factura buscando una línea cuya `description` empiece por el marcador `"Descuento por reglas"`; si ya existe, **no** vuelve a descontar (pone `discountApplied = '0'`). Sin esta guarda, reejecutar el flujo (botón "Probar", un `INVOICE_CREATED` duplicado) acumulaba el descuento una y otra vez. Sólo aplica si la factura está `PENDING`. Detalle de facturas y reglas en [[Facturación, cuotas y Stripe]].

## Guard de re-entrada de la lista de espera

`runWaitlistSlotWorkflows` (en `workflow-proclub-runners.ts`) puede recursar: un workflow `WAITLIST_SLOT_AVAILABLE` puede contener un paso `TRIGGER_WAITLIST_NOTIFY` que **vuelve a llamar** a este mismo runner → recursión infinita. Se corta con un `AsyncLocalStorage<boolean>` (`waitlistDepth`): si ya hay store activo, la re-entrada retorna sin hacer nada. Se usa ALS **a propósito** (no un flag global de proceso) para cortar sólo la re-entrada **dentro de la misma cadena de ejecución**, sin bloquear invocaciones legítimamente concurrentes de otros tenants o requests — la misma disciplina de aislamiento por contexto que sostiene la [[Arquitectura Modelo C]] y la [[Resolución de tenant]].

## Runners programados y de contexto

`workflow-proclub-runners.ts` agrupa disparadores que no nacen de una acción de UI directa:

- **`runBillingCycleWorkflows`**: recorre suscripciones `ACTIVE` con `nextInvoiceDate` vencido, genera factura y dispara `BILLING_CYCLE_DUE`.
- **`runDocumentExpiringWorkflows`**: ventanas de 30/15/5 días sobre `memberDocument.expiresAt` → `DOCUMENT_EXPIRING`.
- **`runConvocationPublishedWorkflows`**, **`runBulkMessageWorkflows`**, **`runTeamChangeApprovedWorkflows`**, **`runCoachAssignedWorkflows`**: cada uno arma el contexto (evento, grupo, cambio de grupo) y ejecuta los flujos que casen.

Estos son los enganches con [[Eventos y asistencia]], [[Contabilidad]] (vía `CREATE_TRANSACTION`) y el alta de nuevos socios ([[Alta automática por webhook]] dispara `MEMBER_CREATED`).

## Relacionado

- [[Facturación, cuotas y Stripe]]
- [[Eventos y asistencia]]
- [[Alta automática por webhook]]
- [[Resolución de tenant]]
- [[Auditoría de seguridad]]
- [[Contabilidad]]
