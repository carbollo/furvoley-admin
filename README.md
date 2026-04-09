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
5. Railway detectará automáticamente el archivo `package.json` y ejecutará los scripts de `build` y `start`.
   - El script `build` ya está configurado para ejecutar las migraciones de Prisma automáticamente (`prisma migrate deploy`).

## Desarrollo Local

1. Clona el repositorio.
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env` en la raíz con tu `DATABASE_URL` local.
4. Ejecuta las migraciones: `npx prisma migrate dev`
5. Inicia el servidor: `npm run dev`
