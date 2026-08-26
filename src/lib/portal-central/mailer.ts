import nodemailer from 'nodemailer'
import { isSingleEmail } from '@/lib/db-input-validation'

/**
 * Envío de correo por SMTP para el portal (correo de bienvenida al dar de alta un
 * club automáticamente desde una tienda externa). Configuración por variables de
 * entorno en el servicio PORTAL (no se guardan credenciales en la BD):
 *   SMTP_HOST      host del servidor SMTP (obligatorio)
 *   SMTP_PORT      puerto (por defecto 587)
 *   SMTP_SECURE    'true' para TLS directo (465); por defecto true si el puerto es 465
 *   SMTP_USER      usuario (opcional si el relay no autentica)
 *   SMTP_PASS      contraseña
 *   SMTP_FROM      remitente "Nombre <correo@dominio>" (por defecto = SMTP_USER)
 */
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

export function isSmtpConfigured(): boolean {
  const c = smtpConfig()
  return Boolean(c.host && c.from)
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
  const { transport, from } = getTransport()
  await transport.sendMail({
    from,
    to: dest,
    subject: 'Prueba de SMTP — Panel del portal',
    text: 'Si recibes este correo, el SMTP del portal (Mailgun) está bien configurado. Ya puedes recibir los correos de bienvenida de las altas automáticas.',
    html: '<p>Si recibes este correo, el <strong>SMTP del portal</strong> (Mailgun) está bien configurado.</p><p>Ya puedes recibir los correos de bienvenida de las altas automáticas.</p>',
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
  const { transport, from } = getTransport()

  const subject = `Bienvenido a ${opts.clubName} — tu acceso al CRM`
  const text =
    `¡Hola!\n\n` +
    `Tu club «${opts.clubName}» ya está activo en el plan «${opts.planName}».\n\n` +
    `Accede aquí: ${opts.loginUrl}\n` +
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
    `<p style="margin:0 0 20px"><a href="${esc(opts.loginUrl)}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Entrar al CRM</a></p>` +
    `<p style="margin:0;color:#6b7280;font-size:13px">Por seguridad, cambia la contraseña tras el primer acceso.</p>` +
    `</div>`

  await transport.sendMail({ from, to: opts.to, subject, text, html })
}
