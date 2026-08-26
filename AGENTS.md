<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mapa del proyecto (`cerebro/`)

`cerebro/` es un vault de notas markdown interconectadas que documentan los subsistemas de este proyecto **citando los ficheros reales del código**. Úsalo como referencia rápida en vez de re-explorar el repo desde cero.

- **Antes de tocar** multi-tenant, auth/sesiones, el portal central, contabilidad/facturación o workflows, lee la nota relevante en `cerebro/` (empieza por `cerebro/🧠 Índice.md`, que enlaza todas). Cada nota te lleva a los `fichero:línea` exactos y anota los *gotchas* (p. ej. `enterWith` no cruza un `await`; nunca fiarse de `x-tenant-slug` del cliente; numerar facturas con `max()+1` no `count()`; todo `'use server'` exportado es un RPC sin auth).
- **Trata las notas como referencia, no como verdad absoluta:** reflejan el estado de cuando se escribieron. Verifica contra los ficheros que citan antes de basar un cambio en ellas.
- **Si cambias el comportamiento de un subsistema, actualiza su nota** en el mismo cambio (o anota que quedó desfasada). Un cerebro desactualizado engaña.
