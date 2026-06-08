# Portal central de acceso Furvoley

Servicio ligero que muestra un **único login** y redirige al CRM correcto (Plantilla, furvoley, etc.) según las credenciales.

## Cómo funciona

```text
Usuario → Portal (login) → verify en cada tenant → SSO token → CRM del club
```

1. El usuario entra email + contraseña en el portal.
2. El portal llama a `POST /api/portal/verify` en cada tenant configurado (con `PORTAL_SSO_SECRET`).
3. Si hay una sola coincidencia, genera un token SSO y redirige a `{tenant}/api/portal/sso?token=...`.
4. El tenant valida el token, crea la cookie de sesión NextAuth y abre el CRM.

Si la misma cuenta existe en varios clubs, el portal muestra un selector.

## Despliegue en Railway

### Antes de nada: rama correcta

El portal está en la rama **`testing`** del repo. Si Railway despliega **`master`**, fallará con:

```text
directory .../services/portal does not exist
```

**Solución (elige una):**

1. En Railway → servicio portal → **Settings** → **Source** → cambia la rama a **`testing`**, o
2. Haz merge de `testing` → `master` y despliega `master`.

### 1. Nuevo servicio `portal`

1. **New** → conecta el repo `furvoley-admin`.
2. **Settings → Source → Root Directory:** `services/portal`
3. **Settings → Build:** debe usar **Dockerfile** (no Railpack). Este repo incluye `railway.toml` para forzarlo.
4. **No** pongas `services/portal` como ruta del Dockerfile si ya tienes Root Directory = `services/portal`; la ruta correcta es solo `Dockerfile`.
5. **Networking:** genera dominio público.

### 2. Variables del portal

| Variable | Ejemplo |
|----------|---------|
| `PORTAL_SSO_SECRET` | Clave larga aleatoria (misma en portal y en **todos** los tenants) |
| `PORTAL_TENANTS` | Ver JSON abajo |

Ejemplo `PORTAL_TENANTS`:

```json
[
  {
    "id": "plantilla",
    "name": "Plantilla",
    "url": "https://plantilla-production.up.railway.app"
  },
  {
    "id": "furvoley",
    "name": "Furvoley",
    "url": "https://furvoley.up.railway.app"
  }
]
```

### 3. Variables en **cada** servicio CRM (Plantilla, furvoley, …)

| Variable | Descripción |
|----------|-------------|
| `PORTAL_SSO_SECRET` | **La misma** clave que en el portal |
| `NEXTAUTH_SECRET` | Secret propio del tenant (sin cambios) |
| `NEXTAUTH_URL` | URL pública **de ese tenant** (sin cambios) |

Sin `PORTAL_SSO_SECRET`, el tenant sigue funcionando con su login local en `/login`; el portal simplemente no podrá verificar credenciales allí.

## Endpoints del tenant (app principal)

| Ruta | Uso |
|------|-----|
| `POST /api/portal/verify` | Solo portal (Bearer `PORTAL_SSO_SECRET`) |
| `GET /api/portal/sso?token=...` | Consume token y abre sesión |

## Healthcheck

`GET /health` → `{ ok: true, tenants: N }`

## Notas

- Cada tenant tiene su **PostgreSQL** independiente; el portal no guarda usuarios.
- El token SSO caduca a los **60 segundos**.
- Para producción, apunta el dominio principal de acceso al servicio **portal**, no a un tenant concreto.
