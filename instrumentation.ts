import { ensureNextAuthSecret } from '@/lib/auth-secret'

export async function register() {
  ensureNextAuthSecret()
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (String(process.env.PORTAL_CENTRAL_HOST || '').trim().toLowerCase() === 'true') return
  const { scheduleHermesGatewayBoot } = await import('@/lib/hermes-gateway/boot')
  scheduleHermesGatewayBoot()
}
