'use server'

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'
import { runWithTenant } from '@/lib/multitenant/request'
import { runMemberCreatedWorkflows } from '@/lib/workflow-engine'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'
import type { RegistrationMemberData } from '@/lib/registration-fields'
import { isHexToken } from '@/lib/db-input-validation'

async function buildSignupUrl(token: string) {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || 'https'
  const requestOrigin = host ? `${proto}://${host}` : null

  const envOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)

  const baseUrl = requestOrigin || envOrigin || 'http://localhost:3000'
  return `${baseUrl}/join/${token}`
}

export async function createSignupLink(expiresInDays = 30) {
  return runWithTenant(async () => {
    // Solo staff puede generar enlaces de alta de socios (es un server action RPC).
    const session = await getServerSession(authOptions)
    const role = normalizeRole((session?.user as { role?: string } | undefined)?.role)
    if (!session?.user || (role !== 'ADMIN' && role !== 'COACH')) {
      throw new Error('No autorizado')
    }
    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const link = await prisma.signupLink.create({
      data: {
        token,
        expiresAt,
        maxUses: 1,
      },
    })

    revalidatePath('/')
    return {
      token: link.token,
      url: await buildSignupUrl(link.token),
      expiresAt: link.expiresAt,
    }
  })
}

export async function submitSignupFromLink(data: RegistrationMemberData & { token: string }) {
  // Auth por TOKEN de enlace (alta pública de socio). runWithTenant activa el club
  // por host: seguro también si se invoca como RPC directo (join-action también lo
  // envuelve; el anidamiento es idempotente).
  return runWithTenant(async () => {
  if (!isHexToken(data.token)) throw new Error('Enlace no válido o desactivado')
  const link = await prisma.signupLink.findUnique({ where: { token: data.token } })
  if (!link || !link.isActive) throw new Error('Enlace no válido o desactivado')
  if (link.expiresAt && link.expiresAt < new Date()) throw new Error('El enlace ha caducado')
  // Consumo ATÓMICO: con peticiones concurrentes del mismo token, solo una gana el
  // "uso" (evita crear varios socios con un enlace de un solo uso).
  const claim = await prisma.signupLink.updateMany({
    where: { id: link.id, isActive: true, usesCount: { lt: link.maxUses } },
    data: { usesCount: { increment: 1 }, isActive: false },
  })
  if (claim.count === 0) throw new Error('El enlace ya fue utilizado')

  const member = await prisma.member.create({
    data: {
      name: data.name,
      dni: data.dni || null,
      birthDate: data.birthDate ?? null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      guardianName: data.guardianName || null,
      guardianPhone: data.guardianPhone || null,
      sportPreference: data.sportPreference || null,
      registrationExtra: data.registrationExtra ?? undefined,
      status: 'ACTIVE',
    },
  })
  void ensureMemberStripeCustomer(member.id).catch(() => {})
  await runMemberCreatedWorkflows(member.id)

  // El uso ya se consumió atómicamente arriba; aquí solo registramos el socio creado.
  await prisma.signupLink.update({
    where: { id: link.id },
    data: { createdMemberId: member.id },
  })

  return member.id
  })
}
