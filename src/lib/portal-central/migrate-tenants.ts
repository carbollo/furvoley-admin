import { spawn } from 'node:child_process'
import path from 'node:path'

export type MigrateResult = { ok: boolean; output: string }

/**
 * Aplica el esquema Prisma actual a TODAS las BD de club (Modelo C).
 *
 * En modo multi-tenant el arranque NO hace `db push` (cada BD de club se migra
 * aquí o al provisionar), y el servidor Postgres solo es accesible desde la red
 * interna de Railway — por eso la migración se dispara desde el propio servicio,
 * no desde una máquina de desarrollo.
 *
 * Es el mismo mecanismo que ya usa el aprovisionamiento de clubes
 * (`scripts/provision-tenant.cjs`), así que la imagen desplegada tiene todo lo
 * necesario para ejecutar `prisma db push`.
 */
export function migrateAllTenants(): Promise<MigrateResult> {
  const script = path.join(process.cwd(), 'scripts', 'migrate-all-tenants.cjs')

  return new Promise((resolve) => {
    let output = ''
    const child = spawn(process.execPath, [script], {
      env: { ...process.env },
      cwd: process.cwd(),
    })
    const onData = (buf: Buffer) => {
      output += buf.toString()
      if (output.length > 40_000) output = output.slice(-40_000)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    // Un `db push` por club: con varios clubes puede tardar bastante.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, output: `${output}\n[migrate-all] Tiempo de espera agotado.` })
    }, 540_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: `${output}\n[migrate-all] No se pudo lanzar: ${err.message}` })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output })
    })
  })
}
