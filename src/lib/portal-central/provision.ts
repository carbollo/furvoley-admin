import { spawn } from 'node:child_process'
import path from 'node:path'

export type ProvisionResult = { ok: boolean; output: string }

/**
 * Ejecuta el aprovisionamiento de la BD de un cliente (Modelo C):
 * `scripts/provision-tenant.cjs <slug>` → CREATE DATABASE + prisma db push +
 * seed del admin. Corre en el servicio portal (Node persistente en Railway),
 * que hereda TENANT_DB_BASE_URL. Es idempotente (reutiliza la BD si ya existe).
 */
export function provisionTenant(input: {
  slug: string
  adminEmail: string
  adminPassword: string
}): Promise<ProvisionResult> {
  const script = path.join(process.cwd(), 'scripts', 'provision-tenant.cjs')
  // El email y (sobre todo) la CONTRASEÑA se pasan por variables de entorno del
  // hijo, NO por argv: los argumentos de proceso son legibles por cualquiera vía
  // `ps aux` / /proc/<pid>/cmdline y los capturan APM/colectores de logs. El script
  // ya lee TENANT_ADMIN_EMAIL/TENANT_ADMIN_PASSWORD del entorno.
  const args = [script, input.slug]

  return new Promise((resolve) => {
    let output = ''
    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        TENANT_ADMIN_EMAIL: input.adminEmail,
        TENANT_ADMIN_PASSWORD: input.adminPassword,
      },
      cwd: process.cwd(),
    })
    const onData = (buf: Buffer) => {
      output += buf.toString()
      if (output.length > 20_000) output = output.slice(-20_000)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    // El db push + seed puede tardar; margen amplio.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, output: `${output}\n[provision] Tiempo de espera agotado.` })
    }, 180_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: `${output}\n[provision] No se pudo lanzar: ${err.message}` })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output })
    })
  })
}
