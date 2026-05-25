import { getHermesSettings } from '@/lib/hermes-gateway/settings'
import { withGatewayLock } from '@/lib/hermes-gateway/gateway-lock'

let bootScheduled = false

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
      const { startGateway } = await import('@/lib/hermes-gateway/supervisor')
      process.stdout.write('[hermes-boot] Arrancando gateway…\n')
      const result = await startGateway({ boot: true })
      if (!result.ok) {
        process.stderr.write(`[hermes-boot] Error: ${result.error || 'desconocido'}\n`)
        return
      }
      process.stdout.write(
        `[hermes-boot] Gateway OK (apiServer=${result.apiServerReady ? 'ready' : 'pending'}).\n`,
      )
    }).catch((err) => {
      process.stderr.write(`[hermes-boot] Fatal: ${err?.message || err}\n`)
    })
  }, delayMs)
}
