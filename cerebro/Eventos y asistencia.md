---
tags: [eventos, asistencia, calendario, server-actions, tokens-publicos, zona-horaria, whatsapp]
---

# Eventos y asistencia

Módulo de **calendario del CRM del club**: eventos (entrenamientos, partidos, torneos, sociales), **pase de lista** (asistencia), convocatorias, e inscripción de socios y no socios desde la ficha pública. Todos los datos viven en la BD del tenant activo (`tenant_<slug>`) y se acceden por el proxy `@/lib/prisma`; ver [[Resolución de tenant]] y [[Aislamiento entre clubes]].

## Modelos de datos

- **`Event`** (`prisma/schema.prisma`): `type` (TRAINING/MATCH/TOURNAMENT/SOCIAL/OTHER), `date`/`endDate`, `status` (SCHEDULED/CANCELLED/COMPLETED), `maxAttendees`, `price`, `isPublic`, `groupId` (nullable → evento de club). Campos del formulario de asistencia programado: `attendanceFormEnabled`, `attendanceReminderDays` (1/3/7/15/30), `attendanceFormSentAt` (null ⇒ aún no enviado).
- **`Attendance`** = fila de pase de lista, `@@unique([eventId, memberId])`. `status`: PRESENT, ABSENT, INJURED, **PENDING** (estado inicial). `reason` para la ausencia.
- **`EventGuestAttendee`** = inscripción de **no socios** (una fila = una entrada), `@@unique([eventId, dni])`. `phone` solo obligatorio en el titular.
- **`EventConvocation`** (`@@unique([eventId, memberId])`): INVITED / CONFIRMED / DECLINED / NOT_CALLED.

Al crear un evento con grupo se **pre-generan las filas de asistencia** (`PENDING`) para los **socios EFECTIVOS** del grupo (directos + los de sus subgrupos por contención, vía `effectiveGroupMemberIds`).

## DOS módulos de server actions (gotcha)

Existen **dos ficheros distintos** de acciones de eventos, ambos `'use server'` y ambos exportan nombres solapados (`createEvent`, `deleteEvent`) con firmas diferentes. No confundirlos:

- **`src/app/actions/events.ts`** — wrappers finos y autorizados sobre la lógica interna. Expone `createEvent(CreateEventData)`, `deleteEvent(id)`, `updateAttendance(id, status, reason)`. Autoriza con `assertEventWriter` (**lanza** `Error`) y envuelve todo en `runWithTenant`. Delega en `events-service.ts`.
- **`src/actions/events.ts`** — CRUD más amplio para la UI del cliente: `getEvents`, `getEventById`, `createEvent` (otra firma: `title/type/date/endDate/isPublic/price/...`), `updateEvent`, `deleteEvent`, **`registerForEvent`** e **`registerGuestAttendees`**. Autoriza con `assertEventStaff` (**devuelve** `{ok:false,error}` en vez de lanzar) y también envuelve en `runWithTenant`. Aquí sí hace `prisma.event.create` directo (no pasa por el servicio).

**Por qué autorizan aquí y no en la UI:** un `'use server'` se expone como **endpoint RPC** invocable por cualquier cliente sin pasar por el gating visual. Por eso cada acción comprueba rol y acceso al equipo. Detalle transversal en [[Server actions y seguridad]]. La regla en ambos: solo **ADMIN**, o **COACH pero únicamente en los equipos que entrena** (se verifica con `groupMembership … role:'COACH'`). Ver [[RBAC y módulos]] y [[Autenticación y sesiones]].

## events-service.ts (lógica SIN auth)

`src/lib/events-service.ts` es el núcleo compartido. **Deliberadamente NO lleva `'use server'`**: antes vivía en un fichero de acciones, lo que exponía estas funciones como RPC sin pasar por los wrappers autorizados; moverlas aquí las vuelve solo invocables server-to-server (route handlers tras `requireRoles`, MCP tras su Bearer, o los actions con auth).

- `createEventInternal` — crea el evento + filas `Attendance` PENDING de los miembros efectivos.
- `updateEventInternal` — al cambiar de estado/fecha dispara los workflows correspondientes (`runEventCancelledWorkflows`, `runEventRescheduledWorkflows`, `runEventCompletedWorkflows`).
- `deleteEventInternal` — dispara *cancelled* antes de borrar.
- `updateAttendanceInternal` — si `status==='ABSENT'` **sin motivo**, dispara `runAttendanceAbsentUnexcusedWorkflows`.

Estos disparadores conectan con el [[Motor de workflows]].

## Inscripción de socio e invitado

- **Socio (`registerForEvent`)**: exige sesión con `memberId`; si el evento tiene grupo, el socio debe pertenecer (`groupMembership`); comprueba aforo contando `Attendance` (PENDING+PRESENT) **más** `EventGuestAttendee`; idempotente (código `ALREADY`). Devuelve códigos tipados (`LOGIN`, `NO_MEMBER`, `NOT_IN_TEAM`, `FULL`, `CANCELLED`…).
- **No socio (`registerGuestAttendees`)**: desde la ficha pública. Valida 1–20 entradas, teléfono ≥9 dígitos (solo en el titular), DNI normalizado y sin repetidos, aforo, y conflictos por `@@unique([eventId,dni])` (captura `P2002`). No requiere sesión pero corre bajo `runWithTenant`.

## Ruta pública por token: /api/public/workflow-response/[token]

`src/app/api/public/workflow-response/[token]/route.ts` sirve los enlaces que se mandan por WhatsApp (confirmar asistencia, convocatoria, encuesta de baja, trial). Como es pública, resuelve el tenant **por host** con `enterTenantFromRequest` (no hay sesión) — ver [[Resolución de tenant]].

- **GET** = *peek*: valida el token, precarga datos del socio y (para asistencia) las filas del evento; si el enlace es **personal** solo devuelve/permite la fila de ese `memberId`.
- **POST** = consume el token. Tipos: `ATTENDANCE` (checklist **multi-uso**, un toque por jugador, caduca sola a los 7 días), `ATTENDANCE_REASON` (**un solo uso**, marca `usedAt`), `CONVOCATION` (upsert `EventConvocation` CONFIRMED/DECLINED), `TRIAL`, `LEAVE_SURVEY`.
- **Autorización propia por token (no usa el action `updateAttendance`)**: comprueba que la `Attendance` pertenece al `eventId` del token (evita usar un token de un evento para tocar otro) y, si es personal, que la fila sea del `memberId` del token. Luego llama **directo** a `updateAttendanceInternal` con esa comprobación como única auth.

## API interna del calendario (src/app/api/crm/events/*)

Todas usan `requireRoles(['ADMIN','COACH'])` de [[RBAC y módulos]] + `parseCuid`:

- **`route.ts` (POST)** — alta, admite **lote de equipos** (`teamIds[]`, con compat `groupId` único); `assertTeamAccess` por equipo; si se marca el formulario de asistencia, solo **programa** el envío (`sendAt = fecha − reminderDays`) — el envío masivo lo hace el cron `/api/jobs/attendance-forms`. Usa `createEventInternal`.
- **`[id]/route.ts` (PATCH)** — edición; `assertCanManageEvent` restringe al COACH a su equipo y, si se **reasigna** de equipo, revalida acceso al destino. Usa `updateEventInternal`.
- **`[id]/attendance-link/route.ts` (POST)** — regenera el enlace-checklist y **asegura** filas de asistencia faltantes (eventos antiguos), luego `scheduleAttendanceForm`.
- **`[id]/convocation/publish/route.ts` (POST)** — publica la convocatoria: upsert INVITED a los seleccionados y NOT_CALLED al resto de PLAYERs efectivos; dispara `runConvocationPublishedWorkflows`.

El envío de enlaces (`src/lib/attendance-link.ts`) manda a cada socio su link personal por WhatsApp (ApiWass); a los **menores** va al `guardianPhone`. Detalles de crons/ApiWass en [[Operaciones, entorno y convenciones]].

## Gotcha de zona horaria (`dateIso`)

Los eventos guardan `date` como instante (`DateTime`/UTC en Postgres) pero se editan en la zona del **cliente**. `src/app/api/crm/data/route.ts` serializa **tres** campos por evento: `fecha` (UTC `toISOString().slice(0,10)`), `hora` (hora **local del servidor**) y **`dateIso`** (instante completo ISO). Al editar, `CrmApp.tsx` (`openEditEventoModal`) reconstruye el `datetime-local` **desde `dateIso` en la zona del cliente**, de modo que al guardar (`new Date(datetimeLocal)`, también en cliente) se conserva el **mismo instante**. Mezclar `fecha` (UTC) con `hora` (servidor) desplazaba la hora en **cada** edición; `dateIso` es el fallback correcto (el par fecha+hora queda solo como compat si el bundle aún no trae `dateIso`).

## Relacionado

- [[Server actions y seguridad]]
- [[Motor de workflows]]
- [[RBAC y módulos]]
- [[Resolución de tenant]]
- [[Aislamiento entre clubes]]
- [[Operaciones, entorno y convenciones]]
