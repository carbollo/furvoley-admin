# Checklist de pruebas PROCLUB

## Fase 0 — Infraestructura
- [ ] `GET /api/crm/workflows/proclub-catalog` devuelve 48 entradas
- [ ] Instalar todo crea/actualiza workflows sin error
- [ ] Enlace `/r/attendance/[token]` carga pase de lista

## Fase 1 — MVP
- [ ] WD-1: alta socio → WA entrenador + tutor
- [ ] WD-2: horario → entrenamientos generados
- [ ] WD-3: job team-calendar → enlace entrenador
- [ ] WD-4: ausencia sin motivo → WA tutor
- [ ] WD-5: cancelar evento → WA plantilla
- [ ] WC-2/3: plantilla → suscripción + factura + enlace
- [ ] WC-7: pago Stripe → PDF WhatsApp
- [ ] WC-8: factura vencida → recordatorio

## Fase 2 — Deportivo ampliado + leads
- [ ] WD-7 convocatoria confirmar/no
- [ ] WD-14 asignar entrenador
- [ ] WP-1 lead + asignación edad

## Fases 3–4
- [ ] WD-12 cron documentos
- [ ] WC-4 cron billing-cycle
- [ ] WB-2 baja cancela suscripción
