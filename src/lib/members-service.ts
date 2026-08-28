import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_ACTIVE_LIKE } from '@/lib/subscription-statuses'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import {
  runMemberCreatedWorkflows,
  runMemberStatusChangedWorkflows,
  runMemberUpdatedWorkflows,
} from '@/lib/workflow-engine'

/**
 * Alta/edición/baja de socios SIN autorización, para llamadas server-to-server ya
 * autorizadas: rutas /api/crm/members/** (requireRoles ADMIN), import CSV en lote,
 * acciones en lote, y la tool MCP de Hermes (Bearer).
 *
 * NO lleva 'use server' a propósito: antes vivía en un fichero 'use server'
 * (src/app/actions.ts), lo que exponía createMember/updateMember/deleteMember como
 * endpoints RPC invocables por cualquier cliente autenticado (creación de socios y,
 * grave, BORRADO en cascada). Al moverlo aquí dejan de ser invocables directamente;
 * el acceso queda solo por los llamadores autorizados de arriba.
 */

export async function createMember(data: {
  name: string
  dni?: string
  birthDate?: Date | null
  email?: string
  phone?: string
  address?: string
  guardianName?: string
  guardianPhone?: string
  sportPreference?: string
  registrationExtra?: Record<string, string> | null
  joinedAt?: Date
  status?: string
}) {
  const { joinedAt, registrationExtra, ...rest } = data
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordRaw, 10)
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        ...rest,
        ...(registrationExtra ? { registrationExtra } : {}),
        ...(joinedAt !== undefined ? { joinedAt } : {}),
      },
    })

    const email = created.email?.trim().toLowerCase()
    if (email) {
      const existing = await tx.user.findUnique({ where: { email } })
      if (!existing) {
        await tx.user.create({
          data: {
            name: created.name,
            email,
            password: hashedDefaultPassword,
            role: 'MEMBER',
            memberId: created.id,
            mustChangePassword: true,
          },
        })
      } else if (existing.role === 'MEMBER' && (!existing.memberId || existing.memberId === created.id)) {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            role: 'MEMBER',
            memberId: created.id,
            password: hashedDefaultPassword,
            mustChangePassword: true,
          },
        })
      } else {
        throw new Error('El email ya está en uso por otra cuenta. Usa otro email para el socio.')
      }
    }
    return created
  })
  await runMemberCreatedWorkflows(member.id)
  revalidatePath('/')
  return member
}

export async function updateMember(
  id: string,
  data: {
    name?: string
    dni?: string
    birthDate?: Date | null
    email?: string
    phone?: string
    address?: string
    sportPreference?: string | null
    status?: string
  },
) {
  const before = await prisma.member.findUnique({
    where: { id },
    select: { status: true },
  })
  const member = await prisma.member.update({ where: { id }, data })

  // Dar de baja a un socio tiene que PARARLE la cuota. Sin esto, su suscripción
  // seguía ACTIVA: el cron le emitía factura cada mes, los avisos de impago le
  // seguían llegando al tutor, y su deuda seguía sumando en el panel del club.
  if (before?.status != null && before.status !== member.status && member.status !== 'ACTIVE') {
    await prisma.subscription.updateMany({
      where: { memberId: id, status: { in: SUBSCRIPTION_ACTIVE_LIKE } },
      data: { status: 'CANCELED' },
    })
  }

  await runMemberUpdatedWorkflows(member.id)
  if (before?.status != null && before.status !== member.status) {
    await runMemberStatusChangedWorkflows(member.id, {
      previousStatus: before.status,
      currentStatus: member.status,
    })
  }
  revalidatePath('/')
  return member
}

export async function deleteMember(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: {
        memberId: id,
        role: { in: ['MEMBER', 'PLAYER'] },
      },
    })
    await tx.user.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.signupLink.updateMany({
      where: { createdMemberId: id },
      data: { createdMemberId: null },
    })
    await tx.order.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.groupMembership.deleteMany({ where: { memberId: id } })
    await tx.attendance.deleteMany({ where: { memberId: id } })
    await tx.payment.deleteMany({ where: { memberId: id } })
    await tx.reminderLog.deleteMany({ where: { memberId: id } })
    await tx.subscription.deleteMany({ where: { memberId: id } })
    await tx.invoice.deleteMany({ where: { memberId: id } })

    await tx.member.delete({ where: { id } })
  })
  revalidatePath('/')
}
