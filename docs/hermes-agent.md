# Hermes Agent + control CRM por WhatsApp y chat web

Hermes Agent permite controlar el CRM Furvoley conversando por **WhatsApp** o por **chat web** dentro del CRM. **Toda la configuración operativa se hace desde el CRM** (pestaña Hermes Agent). ApiWass sigue siendo el canal hacia socios.

## Arquitectura

```
Admin WhatsApp ──┐
                 ├── Hermes Gateway → Ollama Cloud
Admin CRM Chat ──┘         ↓ MCP HTTP + Bearer
                    /api/hermes/mcp → tools CRM → PostgreSQL
Workflows CRM → ApiWass → Socios WhatsApp
```

El chat web usa el **API Server** de Hermes (`127.0.0.1:8642`, OpenAI-compatible). Next.js actúa como proxy autenticado (`POST /api/hermes/chat`); la clave del API Server no sale al navegador.

## Configuración (solo CRM)

1. Entra al CRM como **admin** → pestaña **Hermes Agent** → **Configuración**.
2. Activa Hermes, pega tu **Ollama Cloud API key** ([ollama.com/settings/keys](https://ollama.com/settings/keys)) y el **modelo** (p. ej. `gpt-oss:120b`).
3. Indica **teléfonos admin** permitidos (sin `+`) y guarda.
4. Comprueba que el **gateway** esté en `running` (se reinicia al guardar).
5. **WhatsApp (opcional):** escanea el QR en Configuración.
6. **Chat web:** pestaña **Chat** → escribe, p. ej. «¿Cuántos socios activos hay?»

No hace falta `hermes setup`, shell ni editar YAML a mano: el CRM genera `~/.hermes/config.yaml` y `.env` automáticamente (incluye `API_SERVER_ENABLED=true`).

### Chat web (pestaña Chat)

- Requiere Hermes activo y gateway `running`.
- El API Server debe responder en el puerto **8642** (visible en logs del gateway tras reiniciar).
- El historial se guarda solo en **sessionStorage** del navegador (persiste al recargar la pestaña, no entre dispositivos).
- Botón **Nueva conversación** borra el hilo actual.

### WhatsApp (pestaña Configuración)

- Modo **self-chat:** escribe en el chat **«Mensajes a ti mismo»** de WhatsApp.
- Modo **bot:** usa un número dedicado y escanea el QR en ese móvil.

## Railway (infraestructura)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL`, `NEXTAUTH_*`, `NEXT_PUBLIC_APP_URL` | Infra estándar del CRM |
| Volumen montado en **`/root/.hermes`** | Persiste sesión WhatsApp entre redeploys |

Opcional (override avanzado, no necesario si usas solo el CRM):

| Variable | Descripción |
|----------|-------------|
| `HERMES_ENABLED` | Fuerza activación vía env |
| `HERMES_MCP_API_KEY` | Override clave MCP (si no usas regenerar en CRM) |
| `HERMES_API_SERVER_KEY` | Override clave del API Server (chat web) |
| `HERMES_API_SERVER_PORT` | Puerto del API Server (default `8642`) |
| `FURVOLEY_MCP_URL` | URL pública del MCP |

**Ollama API key y modelo se guardan en la base de datos** vía el CRM, no en Railway.

## Despliegue (contenedor único)

- `Dockerfile` raíz + volumen `/root/.hermes`
- Arranque: `scripts/start-with-hermes.cjs` (db push → sync config desde BD → **Next.js** → gateway Hermes en segundo plano)
- Recursos recomendados: **4 GB RAM / 2 vCPU**

## Tools MCP

Operaciones diarias: KPIs, socios, cobros, equipos, eventos, WhatsApp ApiWass (`crm_send_whatsapp_member`).

Ampliadas: cuotas, contabilidad, workflows, noticias, staff.

Destructivas (`crm_delete_*`): desactivadas salvo checkbox en CRM.

## ApiWass

Sin cambios. Hermes WhatsApp es un canal **independiente** solo para el admin.

## Plan B (servicio Hermes separado)

Ver [`services/hermes/README.md`](../services/hermes/README.md) si el contenedor único no tiene RAM suficiente.
