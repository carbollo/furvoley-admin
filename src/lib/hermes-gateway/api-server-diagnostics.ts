import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getHermesHome } from '@/lib/hermes-gateway/settings'

async function readGatewayLogTail(maxLines = 80): Promise<string | undefined> {
  try {
    const raw = (await readFile(path.join(getHermesHome(), 'gateway.log'), 'utf8')).trim()
    if (!raw) return undefined
    return raw.split('\n').slice(-maxLines).join('\n')
  } catch {
    return undefined
  }
}

export async function readApiServerLogHint(): Promise<string | undefined> {
  const logTail = await readGatewayLogTail(80)
  if (!logTail) return undefined

  const lines = logTail.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] || ''
    if (/API server listening/i.test(line)) return line.trim()
    if (/Port \d+ already in use/i.test(line)) return line.trim()
    if (/API Server: aiohttp not installed/i.test(line)) return line.trim()
    if (/Refusing to start: binding to .* requires API_SERVER_KEY/i.test(line)) return line.trim()
    if (/failed to connect.*api_server/i.test(line)) return line.trim()
    if (/✗ api_server/i.test(line)) return line.trim()
    if (/API_SERVER_ENABLED/i.test(line)) return line.trim()
  }

  const apiLines = lines.filter((line) => /api.?server|API_SERVER|8642/i.test(line))
  return apiLines.slice(-3).join('\n').trim() || undefined
}
