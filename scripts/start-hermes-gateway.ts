#!/usr/bin/env npx tsx
/**
 * Arranca Hermes gateway en segundo plano (después de Next.js).
 * No bloquear el boot del contenedor — Railway debe recibir HTTP en PORT pronto.
 */
import { getHermesSettings } from '@/lib/hermes-gateway/settings'
import { startGateway } from '@/lib/hermes-gateway/supervisor'

async function main() {
  const settings = await getHermesSettings()
  if (!settings.enabled) {
    process.stdout.write('[hermes-gateway] Hermes desactivado — omitido.\n')
    return
  }

  process.stdout.write('[hermes-gateway] Arrancando gateway…\n')
  const gw = await startGateway({ boot: true })
  if (!gw.ok) {
    process.stderr.write(`[hermes-gateway] Error: ${gw.error || 'desconocido'}\n`)
    process.exit(1)
  }

  process.stdout.write(
    `[hermes-gateway] Gateway OK (apiServer=${gw.apiServerReady ? 'ready' : 'pending'}).\n`,
  )
}

main().catch((e) => {
  process.stderr.write(`[hermes-gateway] Fatal: ${e?.message || e}\n`)
  process.exit(1)
})
