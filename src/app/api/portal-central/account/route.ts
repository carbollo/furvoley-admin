import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { assertPortalServerAuth } from '@/lib/portal-sso'
import { isSingleEmail } from '@/lib/db-input-validation'
import { checkLoginRateLimit, loginRateKey, registerLoginFailure, resetLoginAttempts, clientIpFromHeaders } from '@/lib/login-rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cambia el email o la contraseña con la que un club entra al portal.
 *
 * Es la credencial que de verdad usa el cliente: el correo de bienvenida le
 * manda al portal, y el portal autentica contra `PortalUser` y le abre su CRM
 * por SSO. La cuenta que vive dentro del club es un espejo que se materializa
 * a partir de esta.
 *
 * Servidor a servidor: la llama el CRM, no un navegador. Dos cerrojos, y hacen
 * falta los dos:
 *  1. El secreto compartido (`PORTAL_SSO_SECRET`), que demuestra que quien
 *     llama es el CRM y no cualquiera con la URL.
 *  2. La contraseña ACTUAL del usuario, que demuestra que quien está al otro
 *     lado es él. Sin esto, una sesión robada del CRM bastaría para quedarse
 *     con la cuenta cambiándole el email al dueño.
 */
export async function POST(request: Request) {
  // El directorio del portal solo existe en su propio servicio.
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Solo en el servicio portal.' }, { status: 404 })
  }
  const auth = assertPortalServerAuth(request.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: {
    email?: unknown
    currentPassword?: unknown
    newEmail?: unknown
    newPassword?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const email = String(body.email || '').trim().toLowerCase()
  const currentPassword = String(body.currentPassword || '')
  const newEmail = String(body.newEmail || '').trim().toLowerCase()
  const newPassword = String(body.newPassword || '')

  if (!email || !currentPassword) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })
  }
  if (!newEmail && !newPassword) {
    return NextResponse.json({ error: 'No has cambiado nada.' }, { status: 400 })
  }

  // Probar contraseñas contra este endpoint es adivinar la credencial de un
  // cliente: se limita igual que el login, y por la misma clave (IP + email).
  const rlKey = loginRateKey(clientIpFromHeaders(request.headers), email)
  const rl = checkLoginRateLimit(rlKey)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const user = await prisma.portalUser.findUnique({ where: { email } })
  if (!user || user.status !== 'ACTIVE') {
    registerLoginFailure(rlKey)
    // Mismo mensaje que una contraseña mala: no se confirma qué correos existen.
    return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 })
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    registerLoginFailure(rlKey)
    return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 })
  }
  resetLoginAttempts(rlKey)

  const data: { email?: string; passwordHash?: string } = {}

  if (newEmail) {
    if (!isSingleEmail(newEmail)) {
      return NextResponse.json({ error: 'El correo nuevo no es válido.' }, { status: 400 })
    }
    if (newEmail !== email) {
      const ocupado = await prisma.portalUser.findUnique({ where: { email: newEmail } })
      // El email es la llave del portal y es única entre TODOS los clubes: si ya
      // está cogida, avisar antes es mejor que reventar con un error de base.
      if (ocupado) {
        return NextResponse.json({ error: 'Ese correo ya está en uso.' }, { status: 409 })
      }
      data.email = newEmail
    }
  }

  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña nueva debe tener al menos 8 caracteres.' },
        { status: 400 },
      )
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  try {
    await prisma.portalUser.update({ where: { id: user.id }, data })
  } catch (e) {
    // El único fallo esperable es la colisión de email en una carrera; el resto
    // no se detalla al cliente porque vendría del directorio del proveedor.
    console.error('[portal/account] no se pudo actualizar', {
      code: (e as { code?: string })?.code ?? (e instanceof Error ? e.name : 'error'),
    })
    return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, email: data.email ?? email })
}
