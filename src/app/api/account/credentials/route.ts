import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getSessionFromRequest } from '@/lib/session'
import { getEnvAdminCredentials } from '@/lib/env-admin'
import { getPortalSsoSecret } from '@/lib/portal-sso'
import { isSingleEmail } from '@/lib/db-input-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cambia el correo y la contraseña con los que una persona entra a su club.
 *
 * Lo delicado de esto es que hay DOS credenciales y el cliente solo conoce una:
 *
 *  - La del PORTAL (`PortalUser`): es la que sale en el correo de bienvenida y
 *    la que usa de verdad quien compra el CRM. Vive en la base del proveedor,
 *    a la que este servicio no llega, así que se cambia llamando al portal.
 *  - La del CLUB (`User`): la del login directo del CRM. Vive aquí.
 *
 * Se cambian LAS DOS. Tocar solo la del portal dejaría la contraseña vieja
 * abriendo el CRM por la otra puerta, y quien cambia su contraseña normalmente
 * lo hace porque sospecha que alguien se la sabe. Y tocar solo la del club
 * rompería el acceso por el portal, además de duplicar la cuenta: el SSO
 * materializa al usuario buscándolo POR EMAIL, así que con el correo cambiado
 * aquí y no allí, la siguiente entrada crearía una cuenta nueva con el correo
 * viejo.
 *
 * Orden deliberado: primero el portal. Si falla, aquí no se ha tocado nada y el
 * usuario sigue entrando con lo de siempre. Al revés se quedaría sin poder
 * entrar por ninguna de las dos puertas.
 */
export async function POST(request: Request) {
  await enterTenantFromRequest(request)
  const session = await getSessionFromRequest(request)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: { currentPassword?: unknown; newEmail?: unknown; newPassword?: unknown; confirmPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const currentPassword = String(body.currentPassword || '')
  const newEmail = String(body.newEmail || '').trim().toLowerCase()
  const newPassword = String(body.newPassword || '')
  const confirmPassword = String(body.confirmPassword || '')

  if (!currentPassword) {
    return NextResponse.json({ error: 'Introduce tu contraseña actual.' }, { status: 400 })
  }
  if (!newEmail && !newPassword) {
    return NextResponse.json({ error: 'No has cambiado nada.' }, { status: 400 })
  }
  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'La contraseña nueva debe tener al menos 8 caracteres.' }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Las contraseñas no coinciden.' }, { status: 400 })
    }
  }
  if (newEmail && !isSingleEmail(newEmail)) {
    return NextResponse.json({ error: 'El correo nuevo no es válido.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  })
  if (!user?.email) {
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
  }

  const emailActual = user.email.trim().toLowerCase()

  // El administrador fijado por variables de entorno no se toca desde aquí: su
  // credencial vive en la configuración del servidor, y cambiarla en la base de
  // datos daría la sensación de haber cambiado algo que al reiniciar vuelve.
  const envAdmin = getEnvAdminCredentials()
  if (envAdmin && emailActual === envAdmin.email) {
    return NextResponse.json(
      { error: 'Esta cuenta se gestiona en la configuración del servidor, no desde aquí.' },
      { status: 403 },
    )
  }

  // ── 1. El portal, que es la credencial que usa el cliente ──────────────────
  const secreto = getPortalSsoSecret()
  const portalUrl = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '')
  let tocadoElPortal = false

  if (secreto && portalUrl) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    let res: Response
    try {
      res = await fetch(`${portalUrl}/api/portal-central/account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailActual, currentPassword, newEmail, newPassword }),
        signal: ctrl.signal,
      })
    } catch (e) {
      console.error('[account] el portal no respondió', e instanceof Error ? e.name : 'error')
      return NextResponse.json(
        { error: 'No se pudo contactar con el portal. No se ha cambiado nada; inténtalo en un minuto.' },
        { status: 503 },
      )
    } finally {
      clearTimeout(timer)
    }

    const j = (await res.json().catch(() => ({}))) as { error?: string; sinCambios?: boolean }
    if (res.status === 404) {
      // El portal no reconoce a este usuario: es una cuenta que solo existe en el
      // club (creada a mano desde Ajustes). Se sigue con la del club a secas.
      console.warn('[account] el portal no gestiona esta cuenta; se cambia solo la del club')
    } else if (!res.ok) {
      return NextResponse.json({ error: j.error || 'No se pudo cambiar el acceso.' }, { status: res.status })
    } else {
      tocadoElPortal = !j.sinCambios
    }
  }

  // ── 2. La del club, para que no quede una puerta con la clave vieja ────────
  //
  // Si el portal ya validó la contraseña actual, no se vuelve a exigir aquí: la
  // del club puede ser distinta (por ejemplo si se reseteó desde el panel del
  // proveedor) y bloquear el cambio por eso dejaría al cliente sin arreglo.
  if (!tocadoElPortal) {
    if (!user.password || !(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 })
    }
  }

  if (newEmail && newEmail !== emailActual) {
    const ocupado = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })
    if (ocupado && ocupado.id !== user.id) {
      return NextResponse.json({ error: 'Ese correo ya lo usa otra cuenta del club.' }, { status: 409 })
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(newEmail && newEmail !== emailActual ? { email: newEmail } : {}),
      ...(newPassword ? { password: await bcrypt.hash(newPassword, 10) } : {}),
      mustChangePassword: false,
      // Cambiar el acceso echa de todas partes: es el gesto de «que nadie más
      // siga dentro». Sin esto, una sesión abierta en otro sitio seguiría viva
      // 30 días con la credencial vieja.
      sessionsInvalidBefore: new Date(),
    },
  })

  return NextResponse.json({
    ok: true,
    email: newEmail || emailActual,
    // La sesión actual queda invalidada a propósito: la pantalla lo usa para
    // avisar y mandar al login en vez de dejar al usuario dando tumbos con 401.
    sesionCerrada: true,
  })
}
