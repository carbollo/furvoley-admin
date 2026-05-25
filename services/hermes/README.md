# Servicio Hermes separado (plan B)

Cuando el contenedor único (Next + Hermes) no tiene recursos suficientes, despliega un segundo servicio Railway conectado solo al MCP del CRM.

En el despliegue **recomendado (contenedor único)**, toda la config (proveedor LLM Ollama/DeepSeek, WhatsApp, MCP) se guarda en el CRM; este servicio solo aplica si necesitas aislar Hermes.

## Pasos

1. **Servicio CRM** (`furvoley-crm`): usa el `Dockerfile` de la raíz. Expone HTTPS y `/api/hermes/mcp`.
2. **Servicio Hermes** (`furvoley-hermes`):
   - Root directory / build: `services/hermes`
   - Dockerfile: `services/hermes/Dockerfile`
   - Volumen: `/opt/data` → persistencia WhatsApp
3. **Variables en Hermes** (no en CRM):
   - **Ollama Cloud:** `OLLAMA_API_KEY`, `OLLAMA_MODEL` (p. ej. `gpt-oss:120b`) y `model.provider: ollama-cloud` en la plantilla
   - **DeepSeek:** `DEEPSEEK_API_KEY`, modelo p. ej. `deepseek-chat` y `model.provider: deepseek` en la plantilla
   - `WHATSAPP_ENABLED=true`, `WHATSAPP_MODE=bot`
   - `WHATSAPP_ALLOWED_USERS=34600111222` (sin `+`)
   - `FURVOLEY_MCP_URL=https://<crm>.up.railway.app/api/hermes/mcp`
   - `HERMES_MCP_API_KEY=<misma clave que CRM>`
4. **Red:** Hermes solo necesita salida HTTPS al CRM. No hace falta URL pública para Hermes.

## Config generada

`entrypoint.sh` renderiza `config.yaml.template` → `/opt/data/config.yaml` y escribe `OLLAMA_API_KEY` en `.env`.

Ver también [docs/hermes-agent.md](../../docs/hermes-agent.md).
