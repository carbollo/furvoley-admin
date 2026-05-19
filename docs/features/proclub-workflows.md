# Catálogo PROCLUB — workflows Furvoley

Matriz de las 48 plantillas alineadas con PROCLUB CRM. Los flujos ya guardados en BD **no se sobrescriben** al instalar desde la biblioteca.

| ID | Área | Tipo | Estado | Fase | Disparador | Pasos | Notas |
|----|------|------|--------|------|------------|-------|-------|
| WD-1 | sport | Auto | ready | 1 | `MEMBER_CREATED` | ASSIGN_TEAM_BY_AGE, SEND_WHATSAPP | Asignación por edad + WhatsApp. |
| WD-2 | sport | Auto | partial | 2 | `MEMBER_UPDATED` | GENERATE_TEAM_SESSIONS | Requiere TeamSchedule + GENERATE_TEAM_SESSIONS. |
| WD-3 | sport | Auto | partial | 2 | `EVENT_STARTING_SOON` | — | EVENT_STARTING_SOON + aviso entrenador. |
| WD-4 | sport | Auto | partial | 3 | `ATTENDANCE_ABSENT_UNEXCUSED` | SEND_WHATSAPP | ATTENDANCE_ABSENT_UNEXCUSED. |
| WD-5 | sport | Auto | partial | 2 | `EVENT_CANCELLED` | SEND_WHATSAPP_TO_TEAM | EVENT_CANCELLED + SEND_WHATSAPP_TO_TEAM. |
| WD-6 | sport | Mixto | partial | 3 | `EVENT_RESCHEDULED` | SEND_WHATSAPP | Asignación sustituto manual. |
| WD-7 | sport | Auto | partial | 3 | `MEMBER_UPDATED` | — | Modelo convocatoria pendiente. |
| WD-8 | sport | Auto | partial | 3 | `MEMBER_UPDATED` | SEND_WHATSAPP | No convocados. |
| WD-9 | sport | Mixto | partial | 3 | `EVENT_COMPLETED` | — | EVENT_COMPLETED. |
| WD-10 | sport | Mixto | partial | 2 | `MEMBER_STATUS_CHANGED` | REMOVE_FROM_TEAM, ASSIGN_TEAM, SEND_WHATSAPP | Cambio grupo + cuotas. |
| WD-11 | sport | Mixto | partial | 3 | `MEMBER_UPDATED` | SEND_WHATSAPP | Evaluación trimestral. |
| WD-12 | sport | Auto | partial | 3 | `DOCUMENT_EXPIRING` | SEND_WHATSAPP | DOCUMENT_EXPIRING. |
| WD-13 | sport | Auto | partial | 2 | `MEMBER_UPDATED` | SEND_WHATSAPP_TO_TEAM | SEND_WHATSAPP_TO_TEAM. |
| WD-14 | sport | Mixto | partial | 2 | `MEMBER_CREATED` | SEND_WHATSAPP | Onboarding entrenador. |
| WD-15 | sport | Mixto | partial | 3 | `MEMBER_UPDATED` | — | Buzón incidencias pendiente. |
| WC-1 | billing | Manual | manual | 1 | `MEMBER_CREATED` | — | Configurar planes en panel Contabilidad. |
| WC-2 | billing | Auto | partial | 1 | `MEMBER_CREATED` | CREATE_SUBSCRIPTION | CREATE_SUBSCRIPTION al alta. |
| WC-3 | billing | Auto | partial | 1 | `MEMBER_CREATED` | SEND_PAYMENT_LINK, SEND_WHATSAPP | Primer cobro + enlace. |
| WC-4 | billing | Auto | partial | 1 | `INVOICE_CREATED` | SEND_PAYMENT_LINK, SEND_WHATSAPP | INVOICE_CREATED (cron billing). |
| WC-5 | billing | Mixto | partial | 2 | `INVOICE_CREATED` | SEND_WHATSAPP | Cobro extra manual. |
| WC-6 | billing | Auto | partial | 2 | `INVOICE_CREATED` | — | Reglas descuento pendientes. |
| WC-7 | billing | Auto | ready | 1 | `INVOICE_PAID` | SEND_INVOICE_PDF_WHATSAPP | INVOICE_PAID + recibo PDF WhatsApp. |
| WC-8 | billing | Auto | ready | 1 | `INVOICE_OVERDUE` | SEND_WHATSAPP | INVOICE_OVERDUE. |
| WC-9 | billing | Auto | partial | 2 | `INVOICE_OVERDUE` | SEND_PAYMENT_LINK | Reintento pasarela. |
| WC-10 | billing | Auto | partial | 2 | `INVOICE_OVERDUE` | — | Alerta admin. |
| WC-11 | billing | Auto | partial | 2 | `INVOICE_OVERDUE` | — | Resumen semanal (job). |
| WC-12 | billing | Mixto | partial | 2 | `INVOICE_OVERDUE` | SET_MEMBER_STATUS | Suspender socio. |
| WC-13 | billing | Auto | partial | 2 | `MEMBER_UPDATED` | SEND_WHATSAPP | Tarjeta caducada Stripe. |
| WC-14 | billing | Mixto | partial | 2 | `MEMBER_STATUS_CHANGED` | — | Pausa cobros. |
| WC-15 | billing | Mixto | partial | 2 | `MEMBER_STATUS_CHANGED` | — | Devolución prorrateada. |
| WC-16 | billing | Auto | partial | 2 | `INVOICE_PAID` | — | Saldo a favor. |
| WC-17 | billing | Mixto | partial | 3 | `MEMBER_UPDATED` | SEND_WHATSAPP | Renovación temporada. |
| WC-18 | billing | Auto | partial | 2 | `MEMBER_UPDATED` | — | Export contable (job). |
| WP-1 | capture | Auto | partial | 3 | `LEAD_CREATED` | ASSIGN_TEAM_BY_AGE | Requiere modelo Lead. |
| WP-2 | capture | Auto | partial | 3 | `LEAD_CREATED` | SEND_WHATSAPP | LEAD_CREATED. |
| WP-3 | capture | Auto | partial | 3 | `LEAD_CREATED` | SEND_WHATSAPP_TO_TEAM | Aviso entrenador. |
| WP-4 | capture | Auto | partial | 3 | `LEAD_UPDATED` | SEND_WHATSAPP | Recordatorio 5h antes. |
| WP-5 | capture | Auto | partial | 3 | `LEAD_UPDATED` | SEND_WHATSAPP | Lista espera. |
| WP-6 | capture | Auto | partial | 3 | `LEAD_UPDATED` | SEND_WHATSAPP | Seguimiento lead frío. |
| WI-1 | signup | Auto | ready | 1 | `MEMBER_CREATED` | CREATE_SIGNUP_LINK, SEND_WHATSAPP | Enlace inscripción. |
| WI-2 | signup | Mixto | partial | 3 | `MEMBER_UPDATED` | — | Validación menor/tutor. |
| WI-3 | signup | Auto | partial | 3 | `MEMBER_UPDATED` | SEND_WHATSAPP | Firmas documentos. |
| WI-4 | signup | Auto | ready | 1 | `MEMBER_CREATED` | SEND_WHATSAPP | Bienvenida post-inscripción. |
| WB-1 | churn | Mixto | partial | 2 | `MEMBER_STATUS_CHANGED` | — | Solicitud baja admin. |
| WB-2 | churn | Auto | partial | 2 | `MEMBER_STATUS_CHANGED` | SET_MEMBER_STATUS | Cancelar cuotas futuras. |
| WB-3 | churn | Auto | partial | 3 | `MEMBER_STATUS_CHANGED` | SEND_WHATSAPP | Lista espera WP-5. |
| WB-4 | churn | Auto | partial | 2 | `MEMBER_STATUS_CHANGED` | SEND_WHATSAPP | Encuesta motivo. |
| WB-5 | churn | Auto | partial | 3 | `MEMBER_UPDATED` | SEND_WHATSAPP | Campaña retorno. |
