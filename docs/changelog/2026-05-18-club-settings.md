# 2026-05-18 — Modal de configuración del club

## Resumen
Al hacer clic sobre "Administrador" (en el bloque inferior del sidebar o en el chip del topbar) se abre un modal popup, estilo Stitch v2, con la configuración global del club: identidad, escudo, información legal y suscripción de Stripe (con acceso al portal del cliente).

## Cambios

### Backend
- **`prisma/schema.prisma`**: nuevo modelo singleton `ClubSettings` (`isDefault` único) con campos de identidad, contacto, fiscales y Stripe (`stripeCustomerId`, `stripeDashboardUrl`).
- **`src/app/api/crm/club-settings/route.ts`** (nuevo): `GET` y `PATCH`. Solo `ADMIN`. Sanitiza strings, valida email, normaliza URLs (`https://`) y limita el logo a ~512 KB.
- **`src/app/api/crm/club-settings/stripe-portal/route.ts`** (nuevo): `POST` que llama `stripe.billingPortal.sessions.create({ customer })` y devuelve `{ url }`. Maneja `resource_missing` y ausencia de customer ID.

### Frontend
- **`src/components/crm/ClubSettingsModal.tsx`** (nuevo): modal con 3 tabs (Identidad / Información legal / Suscripción), preview de escudo, color picker hex, formulario completo y acciones para abrir el Billing Portal y el Dashboard de Stripe en una pestaña nueva.
- **`src/components/crm/CrmApp.tsx`**:
  - `Sidebar` ahora acepta `onOpenClubSettings`. El bloque de usuario del admin se convierte en `<button>` con icono ⚙.
  - El chip del topbar (avatar + nombre) es clicable y abre el mismo modal cuando el rol es `ADMIN`.
  - Nuevo estado `showClubSettings` en `CrmInner` y render condicional de `<ClubSettingsModal>` al final del shell.

### Docs
- **`docs/features/club-settings.md`** (nuevo): mapa del flujo, modelo, API y UI.
- **`docs/project-index.md`**: añade enlaces a la feature y al changelog de hoy.

## Notas
- El esquema se aplica solo con `prisma db push` (script `start-with-db-sync.cjs`); no hay migración SQL manual.
- El Billing Portal requiere un `STRIPE_SECRET_KEY` válido y un `stripeCustomerId` (`cus_…`) registrado en esa cuenta de Stripe.
- Tipos OK (`tsc --noEmit`), sin nuevos errores de lint.
