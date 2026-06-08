import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getEnvAdminCredentials } from '@/lib/env-admin'
import { getSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const newPassword = String(body.newPassword || '').trim()
  const confirmPassword = String(body.confirmPassword || '').trim()
  const currentPassword = String(body.currentPassword || '')

  if (!newPassword || !confirmPassword) {
    return NextResponse.json({ error: 'Rellena los dos campos' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'La nueva contraseña debe tener al menos 8 caracteres' },
      { status: 400 },
    )
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: 'Las contraseñas no coinciden' },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true, mustChangePassword: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const envAdmin = getEnvAdminCredentials()
  const userEmail = user.email?.trim().toLowerCase() ?? ''
  if (envAdmin && userEmail === envAdmin.email) {
    return NextResponse.json(
      {
        error:
          'La contraseña de este administrador se gestiona en la configuración del servidor (ADMIN_PASSWORD).',
      },
      { status: 403 },
    )
  }

  // Si NO es un cambio obligatorio, exigimos la contraseña actual para verificar.
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Introduce tu contraseña actual' },
        { status: 400 },
      )
    }
    if (!user.password) {
      return NextResponse.json(
        { error: 'No puedes cambiar la contraseña desde aquí.' },
        { status: 400 },
      )
    }
    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) {
      return NextResponse.json(
        { error: 'La contraseña actual no es correcta' },
        { status: 400 },
      )
    }
  }

  // No permitir reusar exactamente la misma contraseña en el flujo forzado
  if (user.mustChangePassword && user.password) {
    const same = await bcrypt.compare(newPassword, user.password)
    if (same) {
      return NextResponse.json(
        { error: 'La nueva contraseña no puede ser igual a la actual' },
        { status: 400 },
      )
    }
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      mustChangePassword: false,
    },
  })

  return NextResponse.json({ ok: true })
}
