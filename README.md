# Furvoley Admin Panel

Panel administrativo para la gestión de socios, cobros y contabilidad de un equipo de voleibol.

## Tecnologías

- Next.js 14+ (App Router)
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Server Actions

## Despliegue en Railway

1. Crea un nuevo proyecto en [Railway](https://railway.app/).
2. Añade un servicio de **PostgreSQL**.
3. Conecta este repositorio de GitHub.
4. En las variables de entorno (`Variables`) del servicio de la aplicación, añade:
   - `DATABASE_URL`: Selecciona la URL de conexión que te proporciona el servicio de PostgreSQL de Railway.
   - `NEXTAUTH_SECRET`: Una cadena de texto aleatoria (puedes generar una ejecutando `openssl rand -base64 32` en tu terminal o inventarte una larga).
   - `NEXTAUTH_URL`: La URL pública de tu aplicación en Railway (ej. `https://furvoley-admin-production.up.railway.app`).
   - `STRIPE_SECRET_KEY`: Tu clave secreta de Stripe.
   - `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` (opcionales): override manual. Por defecto la app crea los webhooks y guarda los signing secrets en la base de datos al abrir el CRM (Configuración del club → Actualizar enlaces).
  - `APIWASS_API_KEY`: Clave API de ApiWass (`sk_...`), usada en backend para conexión/sesiones/envío.
  - `APIWASS_BASE_URL` (opcional): Base URL de ApiWass, por defecto `https://apiwass.com/api`.
  - `APIWASS_DEFAULT_SESSION_ID` (opcional): Session ID por defecto para envíos automáticos (workflows) y panel.
   - `NEXT_PUBLIC_APP_URL`: La misma URL pública de tu aplicación en Railway.
   - `CRON_SECRET`: Token para ejecutar tareas automáticas en `/api/jobs/billing`.
   - `PUBLIC_SPORTS_API_KEY` (opcional): Si se define, la API REST pública deportiva (`/api/public/v1/*`) exige `Authorization: Bearer <clave>` o header `X-API-Key`.
   - **Hermes Agent (control CRM por WhatsApp):**
     - Monta un **volumen Railway** en `/root/.hermes` (sesión WhatsApp).
     - Configura Ollama Cloud API key, modelo y teléfonos admin **desde la pestaña Hermes Agent del CRM** (sin consola).
     - Opcional en Railway: `HERMES_MCP_API_KEY`, `FURVOLEY_MCP_URL` (override).
     - Ver [docs/hermes-agent.md](docs/hermes-agent.md).
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` (recomendado): administrador fijo; en cada arranque y login se sincronizan en la BD. Si faltan una de las dos, se usan `admin@furvoley.com` / `admin123` al arrancar.
   - `REMINDER_WEBHOOK_URL` (opcional): endpoint externo para enviar recordatorios email.
5. Railway detectará automáticamente el archivo `package.json` y ejecutará los scripts de `build` y `start`.
   - `start` ejecuta `prisma db push` y bootstrap del admin automáticamente.

## Desarrollo Local

1. Clona el repositorio.
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env` en la raíz con tu `DATABASE_URL` local.
4. Ejecuta las migraciones: `npx prisma migrate dev`
5. Inicia el servidor: `npm run dev`

## WhatsApp CRM (ApiWass)

- El panel `Whatsapp` en el CRM permite:
  - crear/seleccionar sesión,
  - consultar estado (`READY`, `QR_READY`, etc.),
  - visualizar QR y logs,
  - enviar mensajes manuales.
- Los flujos (`Flujos`) incluyen la acción `Enviar WhatsApp` (`SEND_WHATSAPP`) para automatizaciones.
- **Hermes Agent** (pestaña `Hermes Agent`, solo admin) controla el CRM por WhatsApp vía MCP + **Ollama Cloud**; configúralo todo desde el CRM. Ver [docs/hermes-agent.md](docs/hermes-agent.md).
- Errores comunes:
  - API key inválida o ausente: revisar `APIWASS_API_KEY`.
  - sesión inexistente: crear sesión en pestaña `Whatsapp` o ajustar `APIWASS_DEFAULT_SESSION_ID`.
  - QR no disponible: refrescar estado/logs y reiniciar sesión.
