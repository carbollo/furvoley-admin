import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { APP_ROLES, ROLE_LABEL, normalizeRole, type AppRole } from '@/lib/rbac'

const MANAGEABLE_ROLES: AppRole[] = ['ADMIN', 'COACH', 'TREASURER']

function parseRole(input: unknown): AppRole | null {
  const role = normalizeRole(input)
  return MANAGEABLE_ROLES.includes(role) || role === 'MEMBER' ? role : null
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    include: {
      member: {
        select: { id: true, name: true, email: true },
      },
    },
    take: 500,
  })

  return NextResponse.json({
    users: users.map((u) => {
      const role = normalizeRole(u.role)
      return {
        id: u.id,
        name: u.name || '',
        email: u.email || '',
        role,
        roleLabel: ROLE_LABEL[role],
        hasPassword: !!u.password,
        memberId: u.memberId,
        memberName: u.member?.name || '',
      }
    }),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    email?: string
    password?: string
    role?: string
    memberId?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const passwordRaw = String(body.password || '').trim()
  const role = parseRole(body.role)
  const memberId = body.memberId ? String(body.memberId).trim() : null

  if (!name || !email || !passwordRaw || !role) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }
  if (passwordRaw.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }
  if (!MANAGEABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Solo puedes crear cuentas de admin, entrenador o tesorero' }, { status: 400 })
  }
  if (!APP_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  }

  // Qué está ocupado, y por quién.
  //
  // Antes esto se dejaba estallar contra los índices únicos y se devolvía
  // «Ya existe una cuenta con ese email o socio vinculado»: dos causas
  // distintas en un solo mensaje, sin decir cuál era ni de quién. Un
  // administrador que intentaba dar de alta a un socio que YA tenía cuenta
  // —la suya, normalmente— no tenía forma de saber que el sistema estaba
  // haciendo lo correcto, y lo reportaba como un fallo que le bloqueaba.
  const correoOcupado = await prisma.user.findFirst({
    where: { email },
    select: { name: true },
  })
  if (correoOcupado) {
    return NextResponse.json(
      {
        error: `Ya hay una cuenta con el correo ${email}${correoOcupado.name ? ` (${correoOcupado.name})` : ''}. Usa otro correo o edita esa cuenta.`,
      },
      { status: 409 },
    )
  }

  if (memberId) {
    // Un socio solo puede tener UNA cuenta: `User.memberId` es único, y es
    // deliberado —dos cuentas sobre la misma ficha serían dos personas con el
    // mismo historial. Así que aquí no hay nada que permitir: hay que decirle
    // al administrador cuál es la cuenta que ya existe para que la edite.
    const socioConCuenta = await prisma.user.findFirst({
      where: { memberId },
      select: { email: true, role: true },
    })
    if (socioConCuenta) {
      const socio = await prisma.member.findUnique({
        where: { id: memberId },
        select: { name: true },
      })
      const quien = socio?.name ? `«${socio.name}»` : 'Ese socio'
      return NextResponse.json(
        {
          error: `${quien} ya tiene una cuenta (${socioConCuenta.email || 'sin correo'}). Cambia su rol o su contraseña desde la lista de usuarios en vez de crear otra.`,
        },
        { status: 409 },
      )
    }
  }

  const password = await bcrypt.hash(passwordRaw, 10)

  try {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password,
        role,
        memberId,
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      // Red de seguridad: si dos altas caen a la vez, las comprobaciones de
      // arriba pueden pasar las dos y el índice único frena a la segunda. Aquí
      // sí se puede saber qué campo chocó, así que se dice.
      const campos = Array.isArray(e?.meta?.target) ? (e.meta.target as string[]) : []
      if (campos.includes('memberId')) {
        return NextResponse.json({ error: 'Ese socio ya tiene una cuenta. Recarga la lista de usuarios.' }, { status: 409 })
      }
      if (campos.includes('email')) {
        return NextResponse.json({ error: `Ya hay una cuenta con el correo ${email}.` }, { status: 409 })
      }
      return NextResponse.json({ error: 'Ya existe una cuenta con esos datos.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 400 })
  }
}
