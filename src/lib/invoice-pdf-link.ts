import { createHmac, timingSafeEqual } from 'node:crypto'
import { buildTenantPublicUrl } from '@/lib/public-url'

/**
 * Enlace firmado al PDF de una factura.
 *
 * El recibo que le llega al socio por WhatsApp apuntaba a una ruta que exige
 * sesión: al pulsarlo desde el móvil, sin haber entrado nunca al portal, veía
 * «No autorizado». Un padre que recibe eso asume que el mensaje es falso.
 *
 * Con un token firmado, el enlace abre el PDF sin login pero solo el de esa
 * factura y solo durante un tiempo. La firma va sobre `id.caducidad`, así que
 * cambiar cualquiera de los dos la invalida.
 */
const VALIDEZ_DIAS = 60

/**
 * Misma cadena de secretos que `whop/secret-box.ts`, por dos razones: en este
 * despliegue `NEXTAUTH_SECRET` no existe (el que sí está es `PORTAL_SSO_SECRET`)
 * y, sin secreto, la firma sale vacía y el recibo volvería a llevar al socio a
 * «No autorizado» — el fallo que este módulo existe para arreglar.
 */
function secreto(): string {
  return (
    (process.env.INVOICE_PDF_LINK_SECRET || '').trim() ||
    (process.env.NEXTAUTH_SECRET || '').trim() ||
    (process.env.PORTAL_SSO_SECRET || '').trim()
  )
}

let avisado = false
function avisarSinSecreto() {
  if (avisado) return
  avisado = true
  console.warn(
    '[facturas] Sin INVOICE_PDF_LINK_SECRET/NEXTAUTH_SECRET/PORTAL_SSO_SECRET: ' +
      'los recibos enviados al socio pedirán inicio de sesión.',
  )
}

function firma(payload: string, clave: string): string {
  return createHmac('sha256', clave).update(payload).digest('base64url')
}

/** Token para el PDF de `invoiceId`. Devuelve '' si no hay secreto configurado. */
export function signInvoicePdfToken(invoiceId: string, validezDias = VALIDEZ_DIAS): string {
  const clave = secreto()
  if (!clave) { avisarSinSecreto(); return '' }
  const caduca = Date.now() + validezDias * 24 * 60 * 60 * 1000
  const payload = `${invoiceId}.${caduca}`
  return `${Buffer.from(payload).toString('base64url')}.${firma(payload, clave)}`
}

/** Id de factura si el token es válido y no ha caducado; si no, null. */
export function verifyInvoicePdfToken(token: string): string | null {
  const clave = secreto()
  if (!clave || !token) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  let payload: string
  try {
    payload = Buffer.from(partes[0], 'base64url').toString('utf8')
  } catch {
    return null
  }
  const esperada = firma(payload, clave)
  const a = Buffer.from(esperada)
  const b = Buffer.from(partes[1])
  // Comparación en tiempo constante: comparar con === filtra información sobre
  // la firma correcta a quien pruebe tokens.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const corte = payload.lastIndexOf('.')
  if (corte < 0) return null
  const invoiceId = payload.slice(0, corte)
  const caduca = Number(payload.slice(corte + 1))
  if (!invoiceId || !Number.isFinite(caduca) || Date.now() > caduca) return null
  return invoiceId
}

/** URL completa del PDF, con el tenant y la firma incluidos. */
export function buildInvoicePdfUrl(invoiceId: string): string {
  const token = signInvoicePdfToken(invoiceId)
  const base = buildTenantPublicUrl(`/api/invoices/${invoiceId}/pdf`)
  if (!token) return base
  return base.includes('?') ? `${base}&t=${token}` : `${base}?t=${token}`
}
