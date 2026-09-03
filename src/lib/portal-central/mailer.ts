import nodemailer from 'nodemailer'
import { isSingleEmail } from '@/lib/db-input-validation'

/**
 * Envío de correo del portal: el mensaje de bienvenida con la contraseña que
 * recibe un club recién dado de alta desde la tienda.
 *
 * Dos transportes, y el orden importa:
 *
 *  1. RESEND (preferido). Es una llamada HTTPS a su API, no una conexión SMTP:
 *     no hay puertos que negociar ni handshake que se quede colgado, que es lo
 *     que peor se lleva con un contenedor que puede tardar en arrancar. La
 *     tienda ya manda sus correos por aquí, así que el remitente y el dominio
 *     verificado son los mismos.
 *       RESEND_API_KEY   clave de la API
 *       RESEND_FROM      remitente «Nombre <correo@dominio>»
 *
 *  2. SMTP (respaldo). Se conserva para no dejar tirado a un despliegue que ya
 *     lo tuviera configurado; si hay clave de Resend, no se usa.
 *       SMTP_HOST · SMTP_PORT · SMTP_SECURE · SMTP_USER · SMTP_PASS · SMTP_FROM
 *
 * Las credenciales viven SOLO en variables de entorno del servicio portal:
 * nunca en la base de datos.
 */
function resendConfig() {
  return {
    apiKey: (process.env.RESEND_API_KEY || '').trim(),
    from: (process.env.RESEND_FROM || '').trim(),
  }
}

function smtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const user = (process.env.SMTP_USER || '').trim()
  const pass = process.env.SMTP_PASS || ''
  const from = (process.env.SMTP_FROM || '').trim() || user
  const secure =
    String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true'
  return { host, port, user, pass, from, secure }
}

/** Qué transporte se va a usar de verdad, o null si no hay ninguno listo. */
export function mailTransport(): 'resend' | 'smtp' | null {
  const r = resendConfig()
  if (r.apiKey && r.from) return 'resend'
  const c = smtpConfig()
  if (c.host && c.from) return 'smtp'
  return null
}

export function isMailConfigured(): boolean {
  return mailTransport() !== null
}

/**
 * Manda un correo por el transporte que esté configurado.
 *
 * Un fallo aquí NO se devuelve crudo a quien llama: el mensaje de Resend o del
 * relay puede llevar dentro el host interno o parte de la credencial. Se
 * registra lo justo para diagnosticar —el estado— y se lanza un error limpio.
 */
async function enviar(msg: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const transporte = mailTransport()

  if (transporte === 'resend') {
    const { apiKey, from } = resendConfig()
    // Tope explícito: sin él, una API que no contesta deja colgada el alta
    // entera, que corre dentro de la petición del webhook de la tienda.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    let res: Response
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
        signal: ctrl.signal,
      })
    } catch (e) {
      console.error('[portal/mailer] Resend no respondió', e instanceof Error ? e.name : 'error')
      throw new Error('No se pudo contactar con el servicio de correo.')
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      // Solo el estado y el tipo: el cuerpo puede repetir el remitente o el
      // destinatario, y en un 401 hasta pistas de la clave.
      let tipo = ''
      try {
        const cuerpo = (await res.json()) as { name?: unknown }
        tipo = String(cuerpo?.name ?? '')
      } catch {
        /* respuesta sin JSON: basta con el estado */
      }
      console.error('[portal/mailer] Resend rechazó el envío', { status: res.status, tipo })
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'El servicio de correo rechazó la clave (RESEND_API_KEY).'
          : 'El servicio de correo rechazó el envío. Revisa el remitente (RESEND_FROM) y su dominio verificado.',
      )
    }
    return
  }

  if (transporte === 'smtp') {
    const { transport, from } = getTransport()
    await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
    return
  }

  throw new Error(
    'Correo no configurado: define RESEND_API_KEY y RESEND_FROM en el servicio portal (o, en su defecto, SMTP_HOST y SMTP_FROM).',
  )
}

function getTransport() {
  const c = smtpConfig()
  if (!c.host || !c.from) {
    throw new Error('SMTP no configurado: define al menos SMTP_HOST y SMTP_FROM en el servicio portal.')
  }
  return {
    transport: nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure, // true = TLS directo (465); false = STARTTLS (587)
      // En 587 forzamos STARTTLS: las credenciales de Mailgun nunca viajan en claro.
      requireTLS: !c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    }),
    from: c.from,
  }
}

/** Envía un correo de prueba (para verificar la config SMTP desde el panel). */
export async function sendTestEmail(to: string): Promise<void> {
  const dest = String(to || '').trim()
  if (!isSingleEmail(dest)) throw new Error('Indica UN email de destino válido (sin comas ni varios destinatarios).')
  const via = mailTransport() === 'resend' ? 'Resend' : 'SMTP'
  await enviar({
    to: dest,
    subject: 'Prueba de correo — Panel del portal',
    text: `Si recibes este correo, el envío del portal (${via}) está bien configurado. Ya puedes recibir los correos de bienvenida de las altas automáticas.`,
    html: `<p>Si recibes este correo, el <strong>envío de correo del portal</strong> (${via}) está bien configurado.</p><p>Ya puedes recibir los correos de bienvenida de las altas automáticas.</p>`,
  })
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

export async function sendWelcomeEmail(opts: {
  to: string
  clubName: string
  loginUrl: string
  email: string
  password: string
  planName: string
}): Promise<void> {
  if (!isSingleEmail(opts.to)) {
    throw new Error('Destinatario inválido: debe ser una sola dirección de email.')
  }
  // Sin enlace el correo no puede quedarse mudo: el cliente se quedaría con una
  // contraseña y sin sitio donde usarla. Responder a este mismo correo es el
  // único camino de vuelta que existe siempre, sin configurar nada más.
  const sinEnlace =
    'No hemos podido incluir el enlace de acceso: responde a este correo y te lo enviamos.'

  const subject = `Bienvenido a ${opts.clubName} — tu acceso al CRM`
  const text =
    `¡Hola!\n\n` +
    `Tu club «${opts.clubName}» ya está activo en el plan «${opts.planName}».\n\n` +
    (opts.loginUrl ? `Accede aquí: ${opts.loginUrl}\n` : `${sinEnlace}\n`) +
    `Usuario (email): ${opts.email}\n` +
    `Contraseña: ${opts.password}\n\n` +
    `Por seguridad, cámbiala tras el primer acceso.\n`
  const html =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">` +
    `<h2 style="margin:0 0 12px">¡Bienvenido a ${esc(opts.clubName)}!</h2>` +
    `<p style="margin:0 0 16px;line-height:1.5">Tu club ya está activo en el plan <strong>${esc(opts.planName)}</strong>. Estos son tus datos de acceso:</p>` +
    `<div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 16px;font-family:ui-monospace,monospace;font-size:14px">` +
    `<div>Usuario: <strong>${esc(opts.email)}</strong></div>` +
    `<div>Contraseña: <strong>${esc(opts.password)}</strong></div>` +
    `</div>` +
    // Sin enlace no se pinta el botón: uno que no lleva a ninguna parte es peor
    // que no ponerlo, porque el cliente lo pulsa y cree que el alta ha fallado.
    // Pero se sustituye por texto útil, no por un hueco.
    (opts.loginUrl
      ? `<p style="margin:0 0 20px"><a href="${esc(opts.loginUrl)}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Entrar al CRM</a></p>`
      : `<p style="margin:0 0 20px;line-height:1.5">${esc(sinEnlace)}</p>`) +
    `<p style="margin:0;color:#6b7280;font-size:13px">Por seguridad, cambia la contraseña tras el primer acceso.</p>` +
    `</div>`

  await enviar({ to: opts.to, subject, text, html })
}
