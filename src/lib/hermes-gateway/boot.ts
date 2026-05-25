import { getHermesSettings } from '@/lib/hermes-gateway/settings'
import { waitForHermesApiServerReady } from '@/lib/hermes-gateway/api-server'
import { readApiServerLogHint } from '@/lib/hermes-gateway/api-server-diagnostics'
import { waitForHermesMcpReady, isHermesPythonMcpSdkInstalled } from '@/lib/hermes-gateway/mcp-diagnostics'
import { withGatewayLock } from '@/lib/hermes-gateway/gateway-lock'

let bootScheduled = false

async function waitForApiServerAfterBoot() {
  const health = await waitForHermesApiServerReady({ maxMs: 90000, intervalMs: 2000 })
  if (health.healthy) {
    process.stdout.write('[hermes-boot] API Server listo en puerto 8642.\n')
    return
  }
  const hint = await readApiServerLogHint()
  process.stderr.write(
    `[hermes-boot] API Server no respondió tras 90s${hint ? `: ${hint}` : ''}\n`,
  )
}

/** Start Hermes gateway once Next.js is listening (same process as API routes). */
export function scheduleHermesGatewayBoot() {
  if (bootScheduled) return
  if (String(process.env.HERMES_GATEWAY_BOOT || '').trim().toLowerCase() === 'false') return
  bootScheduled = true

  const delayMs = Number(process.env.HERMES_GATEWAY_BOOT_DELAY_MS || 3000)
  setTimeout(() => {
    void withGatewayLock(async () => {
      const settings = await getHermesSettings()
      if (!settings.enabled) {
        process.stdout.write('[hermes-boot] Hermes desactivado — omitido.\n')
        return
      }
      if (!isHermesPythonMcpSdkInstalled()) {
        process.stderr.write(
          '[hermes-boot] Falta el paquete Python mcp — Hermes no registrará tools CRM. Rebuild con hermes-agent[mcp].\n',
        )
      }

      const mcp = await waitForHermesMcpReady({ maxMs: 45000, intervalMs: 1500 })
      if (!mcp.ok) {
        process.stderr.write(
          `[hermes-boot] MCP local no listo (${mcp.error || 'sin tools'}). Gateway arrancará igual; reinicia si el chat no ve el CRM.\n`,
        )
      } else {
        process.stdout.write(`[hermes-boot] MCP local OK (${mcp.toolCount} tools).\n`)
      }

      const { startGateway, scheduleGatewayRestart } = await import('@/lib/hermes-gateway/supervisor')
      process.stdout.write('[hermes-boot] Arrancando gateway…\n')
      const result = await startGateway({ boot: true })
      if (!result.ok) {
        process.stderr.write(`[hermes-boot] Error: ${result.error || 'desconocido'}\n`)
        return
      }
      process.stdout.write(
        `[hermes-boot] Gateway OK (apiServer=${result.apiServerReady ? 'ready' : 'pending'}).\n`,
      )
      if (!result.apiServerReady) {
        await waitForApiServerAfterBoot()
      }

      if (mcp.ok) {
        setTimeout(() => {
          void withGatewayLock(async () => {
            const { readGatewayMcpLogHint } = await import('@/lib/hermes-gateway/mcp-diagnostics')
            const hint = await readGatewayMcpLogHint()
            if (hint && /fail|error|401|refused|0 tool/i.test(hint)) {
              process.stderr.write(`[hermes-boot] MCP gateway falló (${hint}). Reiniciando gateway…\n`)
              void scheduleGatewayRestart()
            }
          }).catch(() => undefined)
        }, 12000)
      }
    }).catch((err) => {
      process.stderr.write(`[hermes-boot] Fatal: ${err?.message || err}\n`)
    })
  }, delayMs)
}
