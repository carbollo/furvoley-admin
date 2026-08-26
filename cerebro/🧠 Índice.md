---
tags: [moc, indice, home, proclubcrm]
aliases: [Home, Índice, Cerebro, MOC]
---

# 🧠 Cerebro — ProClubCRM

**SaaS CRM deportivo multi-tenant.** Una sola app Next.js 16 (App Router) sobre Prisma/Postgres y NextAuth, desplegada en Railway en **dos servicios** (`crm-mt` = los CRM de los clubes por subdominio; `portal` = panel central), con **una BD Postgres por club** (`tenant_<slug>`) más la BD del portal. Arquitectura "Modelo C".

> [!tip] Cómo usar este vault
> Ábrelo en Obsidian como *vault* (**Abrir carpeta como bóveda** → elige la carpeta `cerebro`). Pulsa `Ctrl/Cmd+G` para la **vista de grafo** y navega por los `[[enlaces]]`. Cada nota cita los ficheros reales del código, así que sirve de mapa vivo del proyecto. Empieza por [[Arquitectura Modelo C]].

## 🗺️ Empieza aquí
- [[Arquitectura Modelo C]] — el "Modelo C", los 2 servicios, el proxy Prisma y el ciclo de vida de un club.
- [[Resolución de tenant]] — cómo cada petición encuentra su club (host → `x-tenant-slug` → `AsyncLocalStorage`) y el gotcha de `enterWith` vs `await`.
- [[Auditoría de seguridad]] — resumen navegable de los 29 hallazgos y sus arreglos.

## 🏛️ Arquitectura y multi-tenant
- [[Arquitectura Modelo C]]
- [[Resolución de tenant]]
- [[Aislamiento entre clubes]] — los 2 críticos cross-tenant y su fix (claim de tenant en el JWT + punto único).

## 🔐 Autenticación y seguridad
- [[Autenticación y sesiones]] — NextAuth por-tenant, JWT con claim `tenant`, sesión HMAC del super-admin, SSO/impersonación.
- [[RBAC y módulos]] — roles, `requireRoles` y el sistema de módulos activables por club.
- [[Server actions y seguridad]] — la clase sistémica: todo `'use server'` exportado es un RPC sin auth.
- [[Auditoría de seguridad]] — la auditoría completa (jul-2026).

## 🎛️ Portal central
- [[Panel de administración del portal]] — `/furvoley-config`: clubes, planes, usuarios, actividad, admins.
- [[Planes y facturación del portal]] — planes, MRR/ARR, trials, límites.
- [[Alta automática por webhook]] — alta de clubes desde una tienda externa (webhook por plan + email SMTP).

## 📊 CRM (funcionalidad)
- [[Contabilidad]] — doble partida, PGC, motor de asientos, conciliación bancaria.
- [[Facturación, cuotas y Stripe]] — facturas, cuotas de socio, suscripciones y webhook de Stripe.
- [[Motor de workflows]] — automatizaciones: triggers, acciones, ramas e idempotencia.
- [[Eventos y asistencia]] — calendario, pase de lista, inscripción pública por token.

## 🚀 Operación
- [[Operaciones, entorno y convenciones]] — despliegue, cron, migración de todas las BD, convenciones y **todas las variables de entorno**.

---
*Generado por Claude Code a partir del código real del repo — 15 notas interconectadas. Regenerable; muévelo donde quieras (es una carpeta portable).*
