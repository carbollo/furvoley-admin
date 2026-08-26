import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verificación de la firma de los webhooks de la pasarela (estilo Standard
 * Webhooks): HMAC-SHA256 sobre `{id}.{timestamp}.{cuerpo crudo}`, con el secreto
 * en base64 tras el prefijo `whsec_`, y cabecera `webhook-signature` con una o
 * más firmas `v1,<base64>` separadas por espacios (rotación de secretos).
 *
 * Fail-closed: sin firma válida no se procesa nada.
 */

/**
 * Tolerancia del desfase temporal.
 *
 * Amplia a propósito (3 días): los reintentos de la pasarela **reenvían la firma
 * original**, no la vuelven a firmar. Con la ventana estrecha habitual (5 min),
 * cada 5xx que se devuelve para pedir un reintento se convertiría en un rechazo
 * definitivo al segundo intento, y el cobro se perdería. La protección real
 * contra reproducción es el registro único del pago, no este margen.
 */
export const MAX_SKEW_SECONDS = 60 * 60 * 72

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'stale' | 'invalid' }

/**
 * Claves candidatas a partir del secreto guardado. El prefijo (`ws_`, `whsec_`)
 * no forma parte de la clave, y no está documentado si el resto va en base64 o
 * en texto plano: se prueban ambas interpretaciones para no depender de eso.
 */
function candidateKeys(secret: string): Buffer[] {
  const raw = String(secret || '').trim()
  const body = raw.replace(/^(ws_|whsec_)/, '')
  const keys: Buffer[] = [Buffer.from(body, 'utf8')]
  const decoded = Buffer.from(body, 'base64')
  if (decoded.length > 0) keys.push(decoded)
  return keys
}

export function verifyWhopSignature(input: {
  rawBody: string
  secret: string
  webhookId: string | null
  timestamp: string | null
  signature: string | null
  nowSeconds?: number
}): VerifyResult {
  const { rawBody, secret, webhookId, timestamp, signature } = input
  if (!secret || !webhookId || !timestamp || !signature) return { ok: false, reason: 'missing' }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid' }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: 'stale' }

  const signedPayload = `${webhookId}.${timestamp}.${rawBody}`
  const expectedList = candidateKeys(secret).map((key) =>
    createHmac('sha256', key).update(signedPayload, 'utf8').digest(),
  )

  // La cabecera puede traer varias firmas (rotación de secreto): basta una válida.
  for (const part of signature.split(' ')) {
    const value = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part
    const candidate = Buffer.from(value.trim(), 'base64')
    for (const expected of expectedList) {
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
        return { ok: true }
      }
    }
  }
  return { ok: false, reason: 'invalid' }
}
