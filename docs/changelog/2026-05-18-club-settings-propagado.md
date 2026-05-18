# 2026-05-18 — Configuración del club totalmente funcional

## Resumen
El modal de configuración del club ahora **propaga la identidad** (nombre, escudo) a todo el CRM y al panel del socio, **inyecta los datos legales en las facturas** (PDF + metadata de Stripe), y la **suscripción Stripe se gestiona mediante variables de entorno de Railway**, manteniendo intactos los botones del modal.

## Cambios

### Stripe → Railway env vars
- **`src/lib/club-settings.ts`** (nuevo): helper centralizado con `getClubSettings`, `getClubBranding`, `getClubIssuer` y `getStripePortalConfig`. Este último lee `STRIPE_CLUB_CUSTOMER_ID` y `STRIPE_DASHBOARD_URL`.
- **`src/app/api/crm/club-settings/stripe-portal/route.ts`**: usa el helper en vez del modelo. Si la env var no está, responde 400 con instrucciones claras.
- **`src/app/api/crm/club-settings/route.ts`**: el GET ahora incluye `stripe: { source, hasCustomerId, customerIdMasked, dashboardUrl }`. El PATCH ya **no acepta** ni `stripeCustomerId` ni `stripeDashboardUrl`.
- **`prisma/schema.prisma`**: se eliminan `stripeCustomerId` y `stripeDashboardUrl` del modelo `ClubSettings` con un comentario que apunta a las env vars.
- **`src/components/crm/ClubSettingsModal.tsx`**: pestaña *Suscripción* rediseñada — aviso informativo, valor enmascarado (read-only), botones **mantenidos** y desactivados solo si la env var falta.

### Identidad funcional (nombre + escudo)
- **`src/app/api/crm/data/route.ts`**: el bundle incluye `club: { name, logoUrl, primaryColor, website }`.
- **`src/components/crm/CrmApp.tsx`**:
  - Sidebar muestra el escudo y el nombre dinámico del club.
  - `CrmProvider` escucha `club-settings-updated` y recarga el bundle al guardar el modal (cambios visibles al instante).
- **`src/components/AppShell.tsx`**: server component que carga `getClubBranding()` y lo pasa como prop a `Sidebar` y `MemberShell`.
- **`src/components/Sidebar.tsx`** y **`src/components/member/MemberShell.tsx`**: aceptan `branding={ name, logoUrl }`. Muestran el escudo (con fallback a la inicial del club) y el nombre dinámicamente.
- **`src/app/layout.tsx`**: `generateMetadata()` ahora compone el `<title>` con el nombre real del club.

### Información legal en facturas y cobros
- **`src/lib/invoice-pdf.ts`**: `InvoicePdfInput` admite un nuevo bloque `issuer { name, legalName, taxId, addressLines, contactEmail, contactPhone, website }`. El PDF imprime los datos del emisor entre la cabecera y los datos del socio.
- **`src/app/api/invoices/[id]/pdf/route.ts`**: carga `getClubIssuer()` y lo pasa al builder, así cada PDF descargado lleva los datos legales del club.
- **`src/app/actions/billing.ts`**:
  - `createInvoiceStripeLink` y `createSubscriptionStripeLink` ahora generan `product_data.name` con el nombre del club + concepto, y añaden `metadata.clubName / clubLegalName / clubTaxId / clubId` (slug).
- **`src/app/actions.ts`** (`generateStripeLink`): igual tratamiento para los `Payment` legacy.

### Docs
- **`docs/features/club-settings.md`** actualizado con la nueva arquitectura.
- **`docs/changelog/2026-05-18-club-settings-propagado.md`** (este archivo).

## Variables de entorno (Railway)
Añadir en el servicio:
- `STRIPE_CLUB_CUSTOMER_ID=cus_XxxxxXxxxxXxxx`  — Cliente de Stripe que representa al club como suscriptor del SaaS.
- `STRIPE_DASHBOARD_URL=https://dashboard.stripe.com/`  — Opcional. Si no se define, se usa `dashboard.stripe.com`.

## Notas
- Tipos OK (`tsc --noEmit`), sin lints nuevos.
- El esquema cambia (drop de dos columnas opcionales): se aplica automáticamente al desplegar gracias a `prisma db push`.
