# Portal central de acceso Furvoley

Login único → redirige al CRM correcto. **Configura los CRMs desde un panel admin web**, sin JSON en Railway.

## Configuración rápida en Railway

### Servicio portal

1. Root Directory: `services/portal`
2. Rama: **`testing`**
3. Volumen montado en **`/data`** (persiste la lista de CRMs)
4. Variables:

| Variable | Qué poner |
|----------|-----------|
| `PORTAL_ADMIN_PASSWORD` | Tu contraseña secreta para el panel admin |
| `PORTAL_SSO_SECRET` | Clave larga (la misma en portal y en cada CRM) |

**Ya no hace falta `PORTAL_TENANTS`** (opcional solo para migrar datos la primera vez).

### Panel admin (tú)

Tras el deploy, abre:

```text
https://TU-URL-PORTAL/__furvoley-config
```

1. Contraseña = valor de `PORTAL_ADMIN_PASSWORD`
2. **Añadir CRM:** nombre + URL pública (`https://furvoley.up.railway.app`)
3. Pulsa **Probar conexión** → debe decir que el CRM responde y tiene SSO activo

### Cada CRM (Plantilla, furvoley, …)

Solo añade y redeploy:

```text
PORTAL_SSO_SECRET=la-misma-clave-que-en-el-portal
```

## Login de usuarios

Los usuarios entran en la **URL raíz del portal** (`/`), no en el panel admin.

## Rutas

| Ruta | Quién |
|------|--------|
| `/` | Login usuarios |
| `/__furvoley-config` | Panel admin (secreto; cambiable con `PORTAL_ADMIN_PATH`) |
| `/health` | Healthcheck |

## Variables opcionales

| Variable | Default |
|----------|---------|
| `PORTAL_ADMIN_PATH` | `__furvoley-config` |
| `PORTAL_DATA_DIR` | `/data` |
| `PORTAL_TENANTS` | Solo import inicial si el volumen está vacío |

## Notas

- Monta volumen en `/data` o perderás la lista de CRMs al redeploy.
- El token SSO caduca a 60 s.
- Cada CRM sigue con su PostgreSQL propio.
