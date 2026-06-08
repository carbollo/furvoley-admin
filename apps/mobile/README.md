# Furvoley Mobile (Expo)

App **nativa** (React Native + Expo Router). No usa WebView ni embebe el panel web del club: toda la interfaz es propia de la app y los datos llegan por **API REST** del CRM.

## Arquitectura

```
App móvil (UI nativa)
  → Portal central: login / selector de club
  → CRM del tenant: JWT Bearer + /api/mobile/* y /api/crm/*
```

- **Socio:** Inicio, Calendario, Pagos, Mural
- **Staff:** Dashboard, Socios, Equipos
- **Pagos:** la app llama `POST /api/invoices/:id/checkout` y abre Stripe en el navegador del sistema (flujo estándar de pago con tarjeta)

## Requisitos

- Node 20+
- Expo Go en el móvil o emulador Android/iOS

## Configuración

```bash
cd apps/mobile
cp .env.example .env
npm install
```

Edita `.env`:

```env
EXPO_PUBLIC_PORTAL_URL=https://TU-PORTAL.up.railway.app
```

En **portal** y **cada CRM** deben estar desplegados los endpoints móvil (`testing`):

- Portal: `POST /api/portal-central/mobile/login`
- CRM: `POST /api/portal/mobile/exchange`, `GET /api/mobile/*`

Variables CRM:

```env
PORTAL_SSO_SECRET=...
NEXTAUTH_URL=https://TU-CRM.up.railway.app
NEXT_PUBLIC_APP_URL=https://TU-CRM.up.railway.app
```

## Arrancar

Desde la raíz del repo:

```bash
npm run mobile
```

O desde `apps/mobile`:

```bash
npm start
```

Escanea el QR con Expo Go.

## Flujo de login

1. Email/contraseña → portal `/api/portal-central/mobile/login`
2. Si hay varios clubs → selector → `/mobile/login/tenant`
3. Intercambio SSO → CRM `/api/portal/mobile/exchange` → JWT en SecureStore
4. La app carga branding del club (`/api/mobile/me`) y pinta la UI nativa
5. Socios → tabs Inicio / Calendario / Pagos / Mural
6. Staff (admin/coach/tesorero) → Dashboard / Socios / Equipos

## Checklist de prueba

- [ ] Login con un solo club
- [ ] Login con cuenta en varios clubs (409)
- [ ] Socio ve home, calendario y facturas
- [ ] Pago de factura abre checkout Stripe
- [ ] Admin ve KPIs y listado de socios
- [ ] Logout y vuelta a login
- [ ] Cambio de contraseña obligatorio (`mustChangePassword`)
