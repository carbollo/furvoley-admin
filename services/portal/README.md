# Portal central de acceso Furvoley

Login único → redirige al CRM correcto. **Panel admin web** para añadir URLs sin JSON.

## Opción recomendada (mismo repo, sin `services/portal`)

Despliega un **servicio Railway aparte** con el **Dockerfile raíz** del repo (como Plantilla/furvoley), pero en modo portal:

| Variable | Valor |
|----------|--------|
| `PORTAL_CENTRAL_HOST` | `true` |
| `PORTAL_ADMIN_PASSWORD` | tu contraseña secreta del panel |
| `PORTAL_SSO_SECRET` | clave larga (igual en portal y en cada CRM) |
| `NEXTAUTH_SECRET` | opcional — si falta, usa `PORTAL_SSO_SECRET` |
| `NEXT_PUBLIC_APP_URL` | URL pública **de este servicio portal** |
| `NEXTAUTH_URL` | la misma URL del portal |

**No hace falta `DATABASE_URL`** en el servicio portal (no usa Postgres).

**Volumen** montado en **`/data`** (guarda la lista de CRMs).

### URLs

| Ruta | Uso |
|------|-----|
| `/portal` | Login usuarios |
| `/furvoley-config` | Panel admin (tú) |

Ejemplo: `https://furvoley-admin-production-25ee.up.railway.app/furvoley-config`

Las URLs antiguas `/__furvoley-config` y `/_furvoley-config` redirigen automáticamente.

### En cada CRM (Plantilla, furvoley…)

```env
PORTAL_SSO_SECRET=la-misma-clave-que-en-el-portal
```

Redeploy cada CRM.

### Red privada Railway (recomendado)

Si el portal y los CRMs están en el **mismo proyecto Railway**, configura en cada CRM del panel admin:

| Campo | Ejemplo |
|-------|---------|
| URL pública | `https://furvoley.up.railway.app` |
| URL interna | `http://furvoley-admin-copy.railway.internal:8080` |

La URL interna la ves en el CRM → **Settings → Private Networking** (`<servicio>.railway.internal`).
Añade el **puerto** del servicio (p. ej. `:8080`) si no responde sin él.

El portal usa la URL interna solo para `/api/portal/verify` (server-to-server).
El redirect SSO al usuario sigue usando la URL pública.

---

## Opción B — servicio ligero `services/portal`

Root Directory `services/portal`, rama **`testing`**, volumen `/data`.  
Mismas variables excepto `PORTAL_CENTRAL_HOST` (no aplica).

---

## Errores frecuentes

| Error | Causa |
|-------|--------|
| `Application failed to respond` | Servicio caído: falta rama `testing`, Root Directory mal, o `DATABASE_URL` obligando db push en portal |
| `/furvoley-config` en un CRM normal | Ese servicio no tiene `PORTAL_CENTRAL_HOST=true` — verás un aviso, no el panel |
| Credenciales inválidas | Falta `PORTAL_SSO_SECRET` en el CRM destino |

## Rama Git

El portal está en **`testing`**. Railway debe desplegar esa rama (o merge a `master`).
