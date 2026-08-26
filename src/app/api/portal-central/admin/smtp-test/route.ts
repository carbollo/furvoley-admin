import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { isSmtpConfigured, sendTestEmail } from '@/lib/portal-central/mailer'
import { checkWebhookRate } from '@/lib/portal-central/webhook-limit'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) return NextResponse.json({ error: 'Solo en el servicio portal.' }, { status: 404 })
  if (!isPortalAdminConfigured()) return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  if (!(await isPortalAdminRequest())) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  return null
}

/** ¿Está configurado el SMTP? (para mostrar el estado en el panel). */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json({ ok: true, configured: isSmtpConfigured() })
}

/** Envía un correo de prueba a la dirección indicada, para verificar Mailgun. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  // Rate-limit (aunque es admin-only): evita email-bombing / quema de reputación
  // Mailgun por una sesión de admin robada o un admin malicioso.
  const rl = checkWebhookRate(`smtp-test::${clientIpFromHeaders(request.headers)}`)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiados envíos de prueba. Espera un momento.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }
  let body: { to?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  try {
    await sendTestEmail(String(body.to || ''))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo enviar el correo de prueba.' }, { status: 400 })
  }
}
