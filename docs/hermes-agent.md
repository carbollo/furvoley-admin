# Hermes Agent + control CRM por WhatsApp

Hermes Agent (Nous Research) permite controlar el CRM Furvoley conversando por WhatsApp. ApiWass sigue siendo el canal operativo hacia socios.

## Arquitectura

```
Admin WhatsApp → Hermes Gateway → DeepSeek API
                      ↓ MCP HTTP + Bearer
              /api/hermes/mcp → tools CRM → PostgreSQL
Workflows CRM → ApiWass → Socios WhatsApp
```

## Variables de entorno (CRM)

| Variable | Descripción |
|----------|-------------|
| `HERMES_ENABLED` | `true` activa endpoint MCP y pestaña Hermes |
| `HERMES_MCP_API_KEY` | Clave Bearer para MCP (prioridad sobre BD) |
| `HERMES_ALLOW_DESTRUCTIVE` | `true` habilita tools de borrado (default off) |
| `FURVOLEY_MCP_URL` | URL pública del MCP (p. ej. `https://tu-app.up.railway.app/api/hermes/mcp`) |

Opcional rate limit: `HERMES_MCP_RATE_MAX` (default 120/min), `HERMES_MCP_RATE_WINDOW_MS`.

## Variables de entorno (Hermes gateway)

| Variable | Descripción |
|----------|-------------|
| `DEEPSEEK_API_KEY` | API key DeepSeek |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Default `deepseek-chat` |
| `WHATSAPP_ENABLED` | `true` |
| `WHATSAPP_MODE` | `bot` |
| `WHATSAPP_ALLOWED_USERS` | Teléfonos admin sin `+`, separados por coma |
| `FURVOLEY_MCP_URL` | URL MCP del CRM |
| `HERMES_MCP_API_KEY` | Misma clave que en el CRM |

ApiWass (`APIWASS_*`) no cambia.

## Despliegue A — un solo servicio (preferido)

1. Usa el `Dockerfile` en la raíz del repo.
2. Monta volumen Railway en `/root/.hermes` para persistir sesión WhatsApp.
3. `start` ejecuta `scripts/start-with-hermes.cjs` (db push + Hermes gateway + Next.js).
4. Recursos recomendados: 4 GB RAM / 2 vCPU.

## Despliegue B — segundo servicio Hermes

Si el contenedor único hace OOM:

| Servicio | Imagen | Expone |
|----------|--------|--------|
| `furvoley-crm` | Dockerfile raíz | HTTPS CRM + MCP |
| `furvoley-hermes` | `services/hermes/Dockerfile` | Salida HTTPS hacia MCP (sin URL pública obligatoria) |

1. Crea servicio `furvoley-hermes` en el mismo proyecto Railway.
2. Build context: `services/hermes`.
3. Volumen en `/opt/data` para sesión WhatsApp.
4. Variables DeepSeek + WhatsApp + `FURVOLEY_MCP_URL` + `HERMES_MCP_API_KEY` solo en Hermes.

Plantilla MCP en `services/hermes/config.yaml.template`.

## Configuración inicial

1. En Railway (CRM): `HERMES_ENABLED=true`, genera `HERMES_MCP_API_KEY` (o desde pestaña Hermes Agent → Regenerar clave).
2. `hermes setup` → DeepSeek → configura MCP apuntando a `FURVOLEY_MCP_URL`.
3. `hermes whatsapp` → escanea QR.
4. `hermes gateway` (o arranque automático con `start-with-hermes.cjs`).

## Tools MCP disponibles

**Operaciones diarias:** `crm_get_kpis`, `crm_search_members`, `crm_get_member`, `crm_create_member`, `crm_create_invoice`, `crm_create_team_invoices`, `crm_list_invoices`, `crm_mark_invoice_paid`, `crm_list_teams`, `crm_add_team_member`, `crm_set_team_coach`, `crm_list_events`, `crm_create_event`, `crm_send_whatsapp_member`.

**Ampliadas:** cuotas, contabilidad, workflows, noticias, staff (`crm_list_membership_plans`, `crm_create_subscription`, `crm_get_tax_config`, `crm_list_accounting_movements`, `crm_create_accounting_movement`, `crm_list_workflows`, `crm_test_workflow`, `crm_list_news`, `crm_create_news`, `crm_list_staff_users`).

**Destructivas (off por defecto):** `crm_delete_member`, `crm_delete_invoice`.

## Verificación

1. Local: `hermes chat` con MCP en `http://localhost:3000/api/hermes/mcp`.
2. WhatsApp: «¿Cuántos socios activos hay?», «Crea un cobro de 30€ a Juan Pérez».
3. Workflows siguen enviando por ApiWass.
4. Tras redeploy, sesión WhatsApp persiste con volumen.

## Skill opcional

Monta `skills/furvoley-crm/SKILL.md` en el contenedor Hermes para instrucciones en español al agente.
