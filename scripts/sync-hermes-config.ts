#!/usr/bin/env npx tsx
/**
 * Sincroniza ClubSettings → ~/.hermes/config.yaml + .env
 * Uso: npx tsx scripts/sync-hermes-config.ts [--start-gateway]
 */
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getHermesSettings } from '@/lib/hermes-gateway/settings'
import { startGateway } from '@/lib/hermes-gateway/supervisor'

async function main() {
  const startGatewayFlag = process.argv.includes('--start-gateway')
  const settings = await getHermesSettings()
  const result = await writeHermesConfigFiles()

  process.stdout.write(
    `[sync-hermes-config] home=${result.home} enabled=${result.enabled} provider=${result.modelProvider} llmKey=${result.hasLlmKey} mcpKey=${result.hasMcpKey} apiServerKey=${result.hasApiServerKey}\n`,
  )

  if (startGatewayFlag && settings.enabled) {
    const gw = await startGateway({ boot: true })
    if (!gw.ok) {
      process.stderr.write(`[sync-hermes-config] gateway: ${gw.error}\n`)
      process.exit(1)
    }
    process.stdout.write(
      `[sync-hermes-config] gateway started (apiServer=${gw.apiServerReady ? 'ready' : 'pending'}).\n`,
    )
  }
}

main().catch((e) => {
  process.stderr.write(`[sync-hermes-config] Fatal: ${e?.message || e}\n`)
  process.exit(1)
})
