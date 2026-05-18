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
- **Suscripción**: `stripeCustomerId` (formato `cus_…`), `stripeDashboardUrl` (override opcional del enlace al dashboard).

Sincronización automática vía `prisma db push` (script `start-with-db-sync.cjs`).

## API
- `GET /api/crm/club-settings` — Devuelve el singleton (lo crea con valores por defecto si no existe). Solo `ADMIN`.
- `PATCH /api/crm/club-settings` — Actualiza cualquier subconjunto de campos. Valida email, normaliza URLs (https://) y limita el logo a ~512 KB de data URL.
- `POST /api/crm/club-settings/stripe-portal` — Crea sesión de **Stripe Billing Portal** para el `stripeCustomerId` configurado y devuelve `url`. Errores típicos: `400` si falta customer ID, `404` si no existe en Stripe.

## UI — `ClubSettingsModal`
Tres pestañas internas:

1. **Identidad** — Subir/quitar escudo (FileReader → data URL), nombre del club, color corporativo (preview), web pública, email y teléfono de contacto.
2. **Información legal** — Razón social, CIF/NIF, dirección, código postal, ciudad, provincia y país.
3. **Suscripción** — Customer ID del club + botón "Abrir portal de cliente Stripe" (Billing Portal en nueva pestaña). URL opcional del Dashboard de Stripe + botón secundario para abrirlo.

El modal:
- Cierra al pulsar overlay, "Cancelar", o `Escape` (excepto durante una operación activa).
- Muestra feedback en banner verde (éxito) o rojo (error).
- Persistencia inmediata al pulsar "Guardar cambios" (PATCH).

## Seguridad
- Todos los endpoints requieren rol `ADMIN` (`requireRoles(['ADMIN'])`).
- El modal solo se renderiza para `ADMIN` en `CrmInner`.
- Las entradas de usuario se sanitizan (trim, `null` para vacíos, validación de email/URL).
