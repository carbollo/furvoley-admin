import { NextResponse } from 'next/server'
import { assertPortalServerAuth, isPortalSsoEnabled, verifyPortalCredentials } from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalSsoEnabled()) {
    return NextResponse.json({ error: 'Portal SSO desactivado en este servicio.' }, { status: 503 })
  }

  const auth = assertPortalServerAuth(request.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: { email?: string; password?: string }
  try {
    body = (await request.json()) as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 })
  }

  const user = await verifyPortalCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      memberId: user.memberId,
      mustChangePassword: user.mustChangePassword,
    },
  })
}
