# Diseño: CRM "Elite Club Operations" (Stitch v2)

## Origen
Generado en Google Stitch ("Furvoley CRM Pro v2", projectId `8710032106855173966`) e implementado en `src/components/crm/`.

## Tokens (en `crm-vars.css`)
- **Sidebar**: `--sidebar-bg #0f172a`, `--sidebar-text #94a3b8`, active border `var(--accent)` con fondo `rgba(0,74,198,0.14)`.
- **Brand/accent**: `--accent #004ac6` (botones, links, focus), `--accent-strong #003ea8` (hover), `--accent-soft #2563eb` (gradientes, charts), `--accent-pill rgba(0,74,198,0.1)` (badges, date pills).
- **Surfaces**: `--surface #f8f9ff` (canvas), `--surface-card #ffffff` (tarjetas), `--surface-low #eff4ff` (segmented controls, tab inactive).
- **Texto**: `--text-primary #0b1c30`, `--text-secondary #434655`, `--text-muted #737686`.
- **Status**: `--green #059669`, `--amber #b45309`, `--red #b91c1c` (con sus respectivos `-light` y `-soft`).
- **Líneas/sombras**: `--border #e2e8f0`, `--card-shadow 0 1px 2px rgba(0,0,0,0.03)`, `--card-shadow-lg 0 10px 30px rgba(15,23,42,0.08)`.

## Composición visual
- **Sidebar 280px** (deep slate) + canvas 100% restante con `var(--surface)`.
- **TopBar 72px sticky** (white, `border-bottom`): título sección 24px/600 + separador + fecha capitalizada en es-ES; cluster derecho: botón Exportar primario (sólo dashboard/ADMIN) → bell circular → bloque user (nombre + rol pill + avatar gradiente `#2563eb→#004ac6`).
- **Dashboard**: max-width 1440px centrado, padding 32x40, gap 32 entre secciones.
  - KPI grid: `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))` con gap 24.
  - Bento 1: 2fr (BarChart anual) + 1fr (Donut socios). Cards `padding: 32`, `border-radius: 12`, `border: 1px solid var(--border)`.
  - Bento 2: 5fr (Próximos eventos) + 7fr (Cobros recientes). Filas mínima 64px con `padding: 16 32`.

## Tipografía
- Font family: **Plus Jakarta Sans** (vía `next/font/google`) para todo el CRM.
- Pesos usados: 400/500/600/700/800.
- Letter-spacing negativo en titulares (`-0.01em` a `-0.02em`).

## Comportamiento
- Hover de filas/items: cambio de color sutil (sin shadow).
- Botones: transición `all 0.15s`, `cursor: pointer`, border-radius 8 (CTAs) o 12/circular (icon buttons).
- Avatares: siempre circulares; gradiente azul corporativo o color sólido derivado del rol.
