'use server'

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

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

  revalidatePath('/members')
  return {
    token: link.token,
    url: await buildSignupUrl(link.token),
    expiresAt: link.expiresAt,
  }
}

export async function submitSignupFromLink(data: {
  token: string
  name: string
  dni: string
  phone?: string
  email?: string
  address?: string
}) {
  const link = await prisma.signupLink.findUnique({ where: { token: data.token } })
  if (!link || !link.isActive) throw new Error('Enlace no válido o desactivado')
  if (link.expiresAt && link.expiresAt < new Date()) throw new Error('El enlace ha caducado')
  if (link.usesCount >= link.maxUses) throw new Error('El enlace ya fue utilizado')

  const member = await prisma.member.create({
    data: {
      name: data.name,
      dni: data.dni,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      status: 'ACTIVE',
    },
  })

  await prisma.signupLink.update({
    where: { id: link.id },
    data: {
      usesCount: { increment: 1 },
      isActive: false,
      createdMemberId: member.id,
    },
  })

  return member.id
}

