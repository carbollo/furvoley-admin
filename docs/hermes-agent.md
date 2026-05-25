# Hermes Agent + control CRM por WhatsApp

Hermes Agent permite controlar el CRM Furvoley conversando por WhatsApp. **Toda la configuración operativa se hace desde el CRM** (pestaña Hermes Agent). ApiWass sigue siendo el canal hacia socios.

## Arquitectura

```
Admin WhatsApp → Hermes Gateway → Ollama Cloud
                      ↓ MCP HTTP + Bearer
              /api/hermes/mcp → tools CRM → PostgreSQL
Workflows CRM → ApiWass → Socios WhatsApp
```

## Configuración (solo CRM)

1. Entra al CRM como **admin** → pestaña **Hermes Agent**.
2. Activa Hermes, pega tu **Ollama Cloud API key** ([ollama.com/settings/keys](https://ollama.com/settings/keys)) y el **modelo** (p. ej. `gpt-oss:120b`).
3. Indica **teléfonos admin** permitidos (sin `+`) y guarda.
4. Escanea el **QR** que aparece en la misma pantalla (WhatsApp → Dispositivos vinculados).
5. Prueba por WhatsApp: «¿Cuántos socios activos hay?»

No hace falta `hermes setup`, shell ni editar YAML a mano: el CRM genera `~/.hermes/config.yaml` y `.env` automáticamente.

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
| `FURVOLEY_MCP_URL` | URL pública del MCP |

**Ollama API key y modelo se guardan en la base de datos** vía el CRM, no en Railway.

## Despliegue (contenedor único)

- `Dockerfile` raíz + volumen `/root/.hermes`
- Arranque: `scripts/start-with-hermes.cjs` (db push → sync config desde BD → gateway → Next.js)
- Recursos recomendados: **4 GB RAM / 2 vCPU**

## Tools MCP

Operaciones diarias: KPIs, socios, cobros, equipos, eventos, WhatsApp ApiWass (`crm_send_whatsapp_member`).

Ampliadas: cuotas, contabilidad, workflows, noticias, staff.

Destructivas (`crm_delete_*`): desactivadas salvo checkbox en CRM.

## ApiWass

Sin cambios. Hermes WhatsApp es un canal **independiente** solo para el admin.

## Plan B (servicio Hermes separado)

Ver [`services/hermes/README.md`](../services/hermes/README.md) si el contenedor único no tiene RAM suficiente.
