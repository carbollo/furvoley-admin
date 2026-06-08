export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (String(process.env.PORTAL_CENTRAL_HOST || '').trim().toLowerCase() === 'true') return
  const { scheduleHermesGatewayBoot } = await import('@/lib/hermes-gateway/boot')
  scheduleHermesGatewayBoot()
}
