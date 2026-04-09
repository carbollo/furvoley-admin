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
   - `STRIPE_WEBHOOK_SECRET`: El secreto del endpoint webhook de Stripe.
   - `NEXT_PUBLIC_APP_URL`: La misma URL pública de tu aplicación en Railway.
   - `CRON_SECRET`: Token para ejecutar tareas automáticas en `/api/jobs/billing`.
   - `ADMIN_EMAIL` (opcional): email del admin bootstrap.
   - `ADMIN_PASSWORD` (opcional): contraseña del admin bootstrap.
   - `REMINDER_WEBHOOK_URL` (opcional): endpoint externo para enviar recordatorios email.
5. Railway detectará automáticamente el archivo `package.json` y ejecutará los scripts de `build` y `start`.
   - `start` ejecuta `prisma db push` y bootstrap del admin automáticamente.

## Desarrollo Local

1. Clona el repositorio.
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env` en la raíz con tu `DATABASE_URL` local.
4. Ejecuta las migraciones: `npx prisma migrate dev`
5. Inicia el servidor: `npm run dev`
