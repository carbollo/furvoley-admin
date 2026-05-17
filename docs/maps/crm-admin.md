# Mapa: CRM Admin (panel de gestión)

## Propósito
Panel de operaciones del club para roles `ADMIN`, `COACH`, `TREASURER`. Consume datos reales de Prisma vía `CrmProvider` y muestra Dashboard, Socios, Equipos, Contabilidad, Calendario, Informes, Workflows, WhatsApp y Personal.

## Componentes/archivos relevantes
- `src/components/crm/CrmApp.tsx`: cliente único que monta `Sidebar` + `TopBar` + `Screen`. Contiene `Dashboard`, `Sidebar`, `KPICard`, `Avatar`, `Badge`, `BarChart`, `DonutChart`, `MiniLineChart` y todas las secciones (Socios, Equipos, …).
- `src/components/crm/crm-vars.css`: tokens CSS del design system "Elite Club Operations" (paleta sidebar slate `#0f172a`, accent `#004ac6`, surface `#f8f9ff`, badges status).
- `src/components/AppShell.tsx`: server component que decide MemberShell (rol MEMBER) vs Sidebar staff.
- `src/lib/rbac.ts`: `canAccessCrmSection` + `normalizeRole`.

## Flujo de funcionamiento
1. **Entrada**: `/` → `AppShell` detecta rol staff → renderiza `CrmApp`.
2. **Carga**: `CrmProvider` (en `crm/CrmProvider`) llama a `/api/crm/bundle` y entrega `bundle` con `user`, `kpis`, `ingresosMensual`, `sociosPorDeporte`, `eventos`, `cobros`.
3. **Render**: `CrmInner` lee `safeActive` (sección activa, por defecto `dashboard`), filtra `NAV` con `canAccessCrmSection(role)` y monta la pantalla.
4. **TopBar**: muestra título de sección (`SECTION_TITLES[safeActive]`), fecha actual en es-ES, botón Exportar CSV (solo en `dashboard` y rol `ADMIN`), notificaciones con dropdown, y bloque user (nombre + rol + avatar gradiente azul corporativo).
5. **Sidebar (280px)**: brand "Furvoley / SISTEMA DE GESTIÓN", lista de secciones con borde activo azul (`var(--accent)`), badge de cobros pendientes en "Contabilidad", bloque user inferior con avatar y rol, y botón "Cerrar sesión" (signOut).
6. **Dashboard (bento grid)**:
   - KPI grid autoflow `minmax(240px,1fr)` con tarjetas: Socios activos, Cobros pendientes (€), Ingresos del mes, Facturas vencidas. Cada `KPICard` muestra icon pill + trend/status pill + número grande + sub + mini line chart.
   - Bento 2fr/1fr: Ingresos del año (BarChart 12 meses, año pill) + Socios por equipo (DonutChart con total en centro + leyenda con %).
   - Bento 5fr/7fr: Próximos eventos (lista con date pill + tipo) → CTA "Ver calendario" (`setActive('calendario')`); Cobros recientes (avatar + concepto + importe + Badge estado) → CTA "Gestionar pagos" (`setActive('contabilidad')`).

## Dependencias
- Internas: [[maps/auth]], [[design/crm-elite-club-operations]].
- Externas: `next-auth/react`, `next/navigation`, `next/font/google` (Plus Jakarta Sans), Prisma.

## Riesgos y notas
- `CrmApp.tsx` está en `@ts-nocheck`; los tipos no se validan dentro del componente. Cuidado al refactorizar.
- Cambios en `--accent` (`#004ac6`) afectan TODO el CRM: botones, links, badge `Activo`, focus rings.
- El `BarChart` se llama con `color="#2563eb"` (accent-soft) hardcodeado en Dashboard para que el chart sea visualmente más vivo que el accent puro.
- Los iconos vienen de `Icon` (SVG inline) en `src/components/crm/icons.tsx`; añadir nuevos en ese archivo si la sección los pide.
