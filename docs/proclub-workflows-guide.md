# Guía de configuración · Biblioteca PROCLUB

Esta guía describe los **48 workflows** del esquema PROCLUB. Instálalos desde **Flujos → Biblioteca PROCLUB → Instalar todo**, luego abre cada flujo en el editor y completa los campos marcados como obligatorios.

## Antes de empezar

1. **WhatsApp (ApiWass):** sesión vinculada en configuración del club.
2. **Equipos:** horarios fijos, temporada y entrenador en *Equipos → Gestionar*.
3. **Planes de cuota (WC-1):** crea `MembershipPlan` en contabilidad; en WC-2/WC-3 indica `planId` en el paso *Crear suscripción*.
4. **Stripe:** webhooks activos para `INVOICE_PAID` (WC-7).
5. **Cron jobs** (Railway/cron externo):
   - `POST /api/jobs/team-calendar` — recordatorios pre-sesión (WD-3)
   - `POST /api/jobs/billing-cycle` — cuotas mensuales (WC-4)
   - `POST /api/jobs/document-expiring` — documentos por vencer (WD-12)

Variables útiles en mensajes: `{memberName}`, `{guardianPhone}`, `{coachName}`, `{assignedTeamName}`, `{teamScheduleSummary}`, `{responseLink}`, `{paymentUrl}`, `{invoicePdfUrl}`, `{eventTitle}`, `{eventDate}`.

---

## Núcleo deportivo (WD)

### WD-1 · Alta del jugador en plantilla
- **Disparador:** alta de socio o confirmación de plantilla (`TEAM_ROSTER_CONFIRMED` / `MEMBER_CREATED`).
- **Configurar:** paso *Asignar por edad* → `teamId`, `minAge`, `maxAge`.
- **Probar:** añadir socio a un equipo; debe llegar WA al entrenador y al tutor.

### WD-2 · Calendario automático de entrenamientos
- **Disparador:** guardar o quitar horario fijo del grupo.
- **Configurar:** fechas de temporada en el equipo; festivos en *Calendario*.
- **Probar:** añadir horario martes 18:00 → ver entrenamientos en calendario hasta fin de temporada.

### WD-3 · Pase de lista al entrenador
- **Disparador:** cron `EVENT_STARTING_SOON` (~90 min antes).
- **Configurar:** mensaje del paso WhatsApp entrenador; usa `{responseLink}`.
- **Probar:** crear sesión en <2 h; ejecutar job team-calendar; abrir enlace `/r/attendance/[token]`.

### WD-4 · Falta no justificada → tutor
- **Disparador:** marcar ausencia sin motivo en pase de lista.
- **Probar:** ausencia sin `reason` → WA tutor con enlace motivo.

### WD-5 · Cancelación / cambio de horario
- **Disparador:** cancelar o reprogramar evento (`EVENT_CANCELLED` / `EVENT_RESCHEDULED`).
- **Configurar:** `teamId` vacío (usa equipo del evento).
- **Probar:** cancelar entrenamiento → WA a plantilla.

### WD-6 · Sustitución de entrenador
- **Disparador:** `COACH_SUBSTITUTION_ASSIGNED` (API al asignar sustituto).
- **Configurar:** teléfonos en fichas de entrenadores.

### WD-7 · Convocatoria
- **Disparador:** publicar convocatoria (`POST /api/crm/events/[id]/convocation/publish`).
- **Probar:** convocados reciben enlace Confirmo / No puede.

### WD-8 · No convocado
- Mismo disparador; audiencia `NOT_CALLED` en `triggerConfig`.

### WD-9 · Resultado de partido
- **Disparador:** marcar evento completado.
- **Probar:** enlace al entrenador para registrar resultado.

### WD-10 · Cambio de grupo
- **Disparador:** aprobar solicitud (`TEAM_CHANGE_APPROVED`).
- **API:** `POST /api/crm/team-changes/[id]/approve`.

### WD-11 · Evaluación al tutor
- **Disparador:** publicar evaluación (`EVALUATION_PUBLISHED`).

### WD-12 · Documento por vencer
- **Disparador:** cron document-expiring; registra `MemberDocument` con `expiresAt`.

### WD-13 · Comunicación masiva
- **Disparador:** `POST /api/crm/bulk-message` con `teamId` + mensaje.

### WD-14 · Onboarding entrenador
- **Disparador:** asignar entrenador en equipo (automático al guardar coach).

### WD-15 · Incidencia resuelta
- **Disparador:** marcar incidencia resuelta en CRM.

---

## Núcleo cobros (WC)

### WC-1 · Catálogo de cuotas
**Manual** — configura planes en Contabilidad, no es workflow.

### WC-2 · Asignar cuotas al alta
- Tras plantilla confirmada: paso `CREATE_SUBSCRIPTION` con `planId` del plan del grupo.

### WC-3 · Primer cobro
- Factura + enlace pago + estado `PENDING_PAYMENT` hasta pago.

### WC-4 · Cuotas periódicas
- Cron `billing-cycle` el día 1; requiere suscripciones activas con `nextInvoiceDate`.

### WC-5 · Cobro extra
- Disparador al crear factura puntual (`EXTRA_CHARGE_CREATED`).

### WC-6 · Descuentos
- Al crear factura; reglas en tabla `DiscountRule` (hermano activo).

### WC-7 · Recibo al pagar
- Disparador `INVOICE_PAID`; envía PDF por WhatsApp.

### WC-8 · Primer aviso impago
- Disparador `INVOICE_OVERDUE`.

### WC-9 a WC-18
Ver catálogo en CRM; fases 4 incluyen reintentos, escalado, pausas, export contable (cron + variables `{clubAdminPhone}`).

---

## Captación (WP-1 … WP-6)

| ID | Disparador | Configuración clave |
|----|------------|---------------------|
| WP-1 | LEAD_CREATED | Equipo por edad |
| WP-2 | LEAD_CREATED | Mensaje info |
| WP-3 | LEAD_CREATED | Aviso entrenador |
| WP-4 | TRIAL_REMINDER_DUE | Enlace prueba 5h antes |
| WP-5 | WAITLIST_SLOT_AVAILABLE | Tras baja (WB-3) |
| WP-6 | LEAD_COLD_FOLLOWUP | Cron seguimiento |

---

## Inscripción (WI-1 … WI-4)

| ID | Disparador | Notas |
|----|------------|-------|
| WI-1 | LEAD_UPDATED (apto) | Enlace signup |
| WI-2 | MEMBER_CREATED | Validación menor → admin |
| WI-3 | CONSENT_PENDING | Firmas 48h |
| WI-4 | MEMBER_CREATED | Bienvenida |

---

## Baja (WB-1 … WB-5)

| ID | Disparador | Notas |
|----|------------|-------|
| WB-1 | MEMBER_LEAVE_REQUESTED | Aviso admin |
| WB-2 | Baja INACTIVE | Cancela suscripción |
| WB-3 | Baja INACTIVE | Lista espera |
| WB-4 | Baja INACTIVE | Encuesta `{responseLink}` |
| WB-5 | MEMBER_RETURN_CAMPAIGN | Retorno programado |

---

## Errores frecuentes

| Síntoma | Solución |
|---------|----------|
| `teamId vacío` | Rellena equipo en paso o asegura contexto del disparador |
| `planId vacío` | WC-2/WC-3: ID del plan de membresía |
| Sin WhatsApp | ApiWass + teléfono tutor/entrenador |
| Enlace caducado | Token 72h; generar nuevo desde flujo |
| WD-2 sin sesiones | `seasonEndDate` + horarios fijos |

---

## Matriz de cobertura

Tras instalar, en Flujos cada tarjeta con `[WD-x]` / `[WC-x]` debe estar **Activa** y probada según `docs/proclub-workflows-testing.md`.
