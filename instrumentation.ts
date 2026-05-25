export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { scheduleHermesGatewayBoot } = await import('@/lib/hermes-gateway/boot')
  scheduleHermesGatewayBoot()
}
