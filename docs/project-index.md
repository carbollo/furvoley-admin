# Project Index — Furvoley

## Sistema
- [[maps/crm-admin]] — Panel CRM admin (Next.js + Prisma) con diseño "Elite Club Operations".
- [[maps/member-portal]] — Portal del socio (MemberShell + dashboard de bienvenida).
- [[maps/auth]] — NextAuth + cambio forzado de contraseña.

## Flujos clave
- [[flows/role-based-routing]] — `AppShell` decide MemberShell vs Sidebar staff.
- [[flows/forced-password-change]] — Middleware redirige a `/change-password` si `mustChangePassword`.

## Diseño
- [[design/crm-elite-club-operations]] — Tokens y guía visual del CRM admin (Stitch v2).

## Changelog por sesión
- [[changelog/2026-05-17]] — Implementación del diseño Stitch v2 en el panel admin.
- [[changelog/2026-05-17-secciones]] — Aplicación del diseño Stitch v2 al resto de secciones admin.
- [[changelog/2026-05-18-club-settings]] — Modal de configuración del club (identidad, legal, Stripe).
- [[changelog/2026-05-18-club-settings-propagado]] — Stripe a env vars + identidad y legal propagados a CRM, socio y facturas.

## Configuración
- [[features/club-settings]] — Modelo `ClubSettings`, endpoints y modal.
