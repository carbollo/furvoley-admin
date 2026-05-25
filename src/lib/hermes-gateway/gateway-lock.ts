/** Serializes gateway stop/start within the Next.js process (avoids runtime lock races). */
let gatewayOp: Promise<unknown> | null = null

export async function withGatewayLock<T>(fn: () => Promise<T>): Promise<T> {
  while (gatewayOp) {
    await gatewayOp.catch(() => undefined)
  }
  const op = fn()
  gatewayOp = op.finally(() => {
    if (gatewayOp === op) gatewayOp = null
  })
  return op
}
