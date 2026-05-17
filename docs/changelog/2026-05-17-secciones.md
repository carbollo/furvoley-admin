# 2026-05-17 · Rediseño completo del CRM Admin con la paleta Stitch v2

## Objetivo

Aplicar el lenguaje visual "Elite Club Operations" (Stitch v2) generado para el dashboard al resto de secciones del panel de administración del CRM, manteniendo intacta toda la lógica funcional (filtros, modales, integraciones, RBAC, contabilidad PGC, automatizaciones, mensajería, etc.).

## Secciones modificadas

| Sección | Cambios principales |
| --- | --- |
| Contabilidad | Header accent, KPI grid (Balance / Ingresos / Gastos / Pendiente destacada), bento "Evolución de tesorería" + "Acciones Rápidas" + "Distribución de gastos", tabla "Facturación reciente" con tabs sub-filtro y tabs de PGC (Diario, Mayor, Cuentas, Balances, Cobros) en el mismo card. |
| Socios | Header accent + 4 KPI (Total / Activos / Morosos / Cuota media), filtros pill, tabla "Directorio de socios" con hover, acciones (editar / eliminar / menú) en outline accent. |
| Equipos | Header accent + 4 KPI (Equipos / Jugadores / Categorías / Sin coach), card grande "Plantillas del club" con grid de cards equipo con hover accent. |
| Calendario | Header accent + 4 KPI (Eventos / Partidos-torneos / Entrenamientos / Próximo evento), date filters + paginado mes (← Hoy →), bento calendar grid + lista de eventos. |
| Informes | Header accent + 4 KPI (Ingresos / Gastos / Resultado neto / Morosos), bento BarChart "Ingresos y gastos" + DonutChart con total en el centro, tabla de morosos con CTA "Ver en socios". |
| Workflows | Header accent + 3 KPI (Configurados / Activos / Pasos), botones primarios accent, lista de flujos con estado al mismo lenguaje visual. |
| WhatsApp | Header accent + pill de estado de sesión, 3 KPI (Sesión activa / Estado / Logs), bento Sesión vinculada + QR, Enviar manual + Logs. |
| Personal | Header accent + 4 KPI (Total cuentas / Admins / Coaches / Tesoreros), formularios "Crear cuenta" y "Publicar noticia" en cards accent, tabla de cuentas + mural de noticias con badges de estado y prioridad. |

## Patrón visual aplicado a todas las secciones

1. Wrapper raíz: `background: var(--surface)`, contenido centrado con `maxWidth: 1440px` y padding `32px 40px 56px`.
2. Header: título 28 px en `var(--accent)` con `letter-spacing: -0.02em`, subtítulo 14 px en `var(--text-secondary)`.
3. KPI grid 4 columnas auto-fit (`minmax(240px, 1fr)`): se reutiliza el componente `KPICard` con icono pill, badge superior derecho y descripción.
4. Cards de contenido principales con `var(--surface-card)`, `radius: 12px`, `padding: 24px`/`32px`, `box-shadow: var(--card-shadow)`, `border: 1px solid var(--border)`.
5. Botones primarios: fondo `var(--accent)` con `box-shadow` corporativa azul y hover a `var(--accent-strong)`.
6. Tabs y filtros como pills sobre `var(--surface-low)`, ítem activo con `var(--surface-card)` + sombra suave y texto en `var(--accent)`.
7. Tablas con head sobre `var(--surface-low)`, padding generoso `16px 32px`, filas separadas por `border-top` y hover en `var(--surface-low)`.

## Integridad funcional

- Toda la lógica de filtros, búsquedas, modales (Nuevo Cobro, Nuevo Evento, Nuevo Equipo, etc.), formularios, PGC, asientos, ledger, tax config, RBAC, Stripe y WhatsApp se mantiene 1:1.
- No se modificaron rutas, endpoints, schemas, ni middleware.
- Se preservan las pantallas y funcionalidades del panel de socio (`MemberShell`/`MemberDashboard`) intactas.

## Validaciones

- `tsc --noEmit`: ✓ sin errores.
- `read_lints` sobre `CrmApp.tsx` y `WorkflowsSection.tsx`: ✓ sin nuevos lints.
- Verificación manual: pantalla por pantalla se cierra correctamente el wrapper extra introducido por la envoltura `maxWidth`.

## Archivos modificados

- `src/components/crm/CrmApp.tsx`
- `src/components/crm/WorkflowsSection.tsx`

## Documentación añadida

- Este changelog.
