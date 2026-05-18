# Configuración del club (`ClubSettings`)

Modal de **configuración del club** accesible solo para `ADMIN`, conectado al modelo singleton `ClubSettings`.

## Entradas
- **Sidebar (CRM admin)** — al hacer clic en el bloque del usuario "Administrador" en la parte inferior del sidebar (ver [[maps/crm-admin]]).
- **Topbar (CRM admin)** — al hacer clic en el chip de avatar + nombre del usuario en la barra superior.

Ambos abren el modal `ClubSettingsModal` (popup centrado, respetando UI/UX Stitch v2).

## Modelo (Prisma)
`ClubSettings` (singleton, garantizado con `@@unique([isDefault])`):

- **Identidad**: `name`, `logoUrl` (data URL base64 o URL https), `primaryColor`, `website`.
- **Contacto**: `contactEmail`, `contactPhone`.
- **Legal**: `legalName`, `taxId`, `address`, `postalCode`, `city`, `province`, `country`.

> La **suscripción Stripe** NO vive en la BD. El Customer ID y la URL del Dashboard se leen de las variables de entorno de Railway: `STRIPE_CLUB_CUSTOMER_ID` y `STRIPE_DASHBOARD_URL`. El modal solo los muestra y permite abrirlos en una pestaña nueva.

Sincronización automática vía `prisma db push` (script `start-with-db-sync.cjs`).

## Helper centralizado (`src/lib/club-settings.ts`)
- `getClubSettings()` — devuelve el singleton (lo crea si no existe).
- `getClubBranding()` — `{ name, logoUrl, primaryColor, website }` para sidebars/headers/portales. Fallback seguro a "Furvoley" si la BD falla.
- `getClubIssuer()` — datos del **emisor** para facturas y Stripe: nombre comercial, razón social, CIF/NIF, dirección multi-línea, contacto y web.
- `getStripePortalConfig()` — `{ customerId, hasCustomerId, dashboardUrl, customerIdMasked }` leídos de `process.env.STRIPE_CLUB_CUSTOMER_ID` y `process.env.STRIPE_DASHBOARD_URL`.

## API
- `GET /api/crm/club-settings` — Devuelve el singleton + el bloque `stripe` calculado desde env vars (`source: 'env'`, `hasCustomerId`, `customerIdMasked`, `dashboardUrl`). Solo `ADMIN`.
- `PATCH /api/crm/club-settings` — Actualiza cualquier subconjunto de campos *editables* (no incluye Stripe). Valida email, normaliza URLs (https://) y limita el logo a ~512 KB de data URL.
- `POST /api/crm/club-settings/stripe-portal` — Crea sesión de **Stripe Billing Portal** usando `process.env.STRIPE_CLUB_CUSTOMER_ID` y devuelve `url`. Errores típicos: `400` si la env var no está fijada, `404` si el customer no existe en la cuenta de Stripe.

## UI — `ClubSettingsModal`
Tres pestañas internas:

1. **Identidad** — Subir/quitar escudo (FileReader → data URL), nombre del club, color corporativo (preview), web pública, email y teléfono de contacto.
2. **Información legal** — Razón social, CIF/NIF, dirección, código postal, ciudad, provincia y país. **Estos datos se usan en el PDF de cada factura y como `metadata` de los Stripe Checkouts** (`clubName`, `clubLegalName`, `clubTaxId`).
3. **Suscripción** — Customer ID enmascarado (read-only, gestionado en Railway) + botón "Abrir portal de cliente Stripe". URL del Dashboard de Stripe (read-only) + botón secundario para abrirlo. Aviso claro de que los valores se configuran como variables de entorno.

El modal:
- Cierra al pulsar overlay, "Cancelar", o `Escape` (excepto durante una operación activa).
- Muestra feedback en banner verde (éxito) o rojo (error).
- Persistencia inmediata al pulsar "Guardar cambios" (PATCH).
- Tras guardar dispara `window.dispatchEvent('club-settings-updated')`; el `CrmProvider` recarga el bundle para reflejar el nuevo nombre/escudo en sidebar y topbar al instante.

## Branding propagado a toda la app
- **CRM admin** (`src/components/crm/CrmApp.tsx`): el bundle de `/api/crm/data` incluye `club: { name, logoUrl, primaryColor, website }`. El sidebar muestra el escudo en cabecera y el nombre dinámico.
- **Sidebar legacy** (`src/components/Sidebar.tsx`): recibe `branding` desde `AppShell` (server component) y renderiza el escudo + nombre.
- **Panel del socio** (`src/components/member/MemberShell.tsx`): recibe `branding` desde `AppShell` y muestra escudo + nombre del club (con `text-overflow: ellipsis`).
- **Title del navegador** (`src/app/layout.tsx`): `generateMetadata()` lee `getClubBranding()` y compone `"<Club> · Panel de administración"`.
- **Facturas (PDF)**: `buildInvoicePdf({ issuer })` imprime razón social, CIF/NIF, dirección, contacto y web del club encima de los datos del socio.
- **Stripe Checkouts** (`createInvoiceStripeLink`, `createSubscriptionStripeLink`, `generateStripeLink`): el `product_data.name` ahora va prefijado por el nombre del club y los `metadata` llevan `clubName`, `clubLegalName`, `clubTaxId` y un `clubId` slugificado.

## Seguridad
- Todos los endpoints requieren rol `ADMIN` (`requireRoles(['ADMIN'])`).
- El modal solo se renderiza para `ADMIN` en `CrmInner`.
- Las entradas de usuario se sanitizan (trim, `null` para vacíos, validación de email/URL).
- El Customer ID de Stripe vive solo en variables de entorno: ni se persiste en BD ni se acepta por API, por lo que el ADMIN no puede manipularlo desde la UI.
