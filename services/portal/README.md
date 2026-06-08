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
| `/__furvoley-config` | Panel admin (tú) |

Ejemplo: `https://furvoley-admin-production-25ee.up.railway.app/__furvoley-config`

### En cada CRM (Plantilla, furvoley…)

```env
PORTAL_SSO_SECRET=la-misma-clave-que-en-el-portal
```

Redeploy cada CRM.

---

## Opción B — servicio ligero `services/portal`

Root Directory `services/portal`, rama **`testing`**, volumen `/data`.  
Mismas variables excepto `PORTAL_CENTRAL_HOST` (no aplica).

---

## Errores frecuentes

| Error | Causa |
|-------|--------|
| `Application failed to respond` | Servicio caído: falta rama `testing`, Root Directory mal, o `DATABASE_URL` obligando db push en portal |
| `/__furvoley-config` en un CRM normal | Ese servicio no tiene `PORTAL_CENTRAL_HOST=true` — verás un aviso, no el panel |
| Credenciales inválidas | Falta `PORTAL_SSO_SECRET` en el CRM destino |

## Rama Git

El portal está en **`testing`**. Railway debe desplegar esa rama (o merge a `master`).
