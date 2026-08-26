import { createMember } from '@/lib/members-service'
import { createSubscription } from '@/app/actions/billing'
import { prisma } from '@/lib/prisma'
import type { MemberCsvRow } from '@/lib/members-csv'

export type BulkImportOptions = {
  planId?: string
  skipExisting?: boolean
  paymentRequiredOnEnrollment?: boolean
}

export type BulkImportRowError = { row: number; message: string }

export type BulkImportResult = {
  created: number
  skipped: number
  errors: BulkImportRowError[]
}

const MAX_ROWS = 500

async function emailTaken(email: string) {
  const normalized = email.trim().toLowerCase()
  const [member, user] = await Promise.all([
    prisma.member.findFirst({ where: { email: { equals: normalized, mode: 'insensitive' } }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: normalized }, select: { id: true, role: true, memberId: true } }),
  ])
  if (member) return true
  if (user && (user.role !== 'MEMBER' || user.memberId)) return true
  return false
}

export async function importMembersFromCsvRows(
  rows: MemberCsvRow[],
  options: BulkImportOptions = {},
): Promise<BulkImportResult> {
  if (rows.length > MAX_ROWS) {
    return {
      created: 0,
      skipped: 0,
      errors: [{ row: 0, message: `Máximo ${MAX_ROWS} filas por importación.` }],
    }
  }

  let plan: { id: string; paymentRequiredOnEnrollment: boolean } | null = null
  if (options.planId) {
    const found = await prisma.membershipPlan.findUnique({
      where: { id: options.planId },
      select: { id: true, isActive: true, paymentRequiredOnEnrollment: true },
    })
    if (!found?.isActive) {
      return {
        created: 0,
        skipped: 0,
        errors: [{ row: 0, message: 'El plan de cuota seleccionado no es válido.' }],
      }
    }
    plan = found
  }

  let created = 0
  let skipped = 0
  const errors: BulkImportRowError[] = []

  for (const row of rows) {
    try {
      if (row.email && options.skipExisting !== false) {
        if (await emailTaken(row.email)) {
          skipped++
          continue
        }
      }

      const member = await createMember({
        name: row.name,
        email: row.email,
        phone: row.phone,
        dni: row.dni,
        address: row.address,
        sportPreference: row.sportPreference,
        guardianName: row.guardianName,
        guardianPhone: row.guardianPhone,
        birthDate: row.birthDate ?? undefined,
        joinedAt: row.joinedAt,
        status: row.status || 'ACTIVE',
      })

      if (plan) {
        try {
          await createSubscription({
            memberId: member.id,
            planId: plan.id,
            paymentRequiredOnEnrollment:
              typeof options.paymentRequiredOnEnrollment === 'boolean'
                ? options.paymentRequiredOnEnrollment
                : plan.paymentRequiredOnEnrollment,
            // Importar un CSV no debe disparar un WhatsApp por cada fila (hasta
            // 500) ni una llamada a la pasarela por socio dentro de la petición.
            notifyEnrollment: false,
          })
        } catch (e) {
          errors.push({
            row: row.rowNumber,
            message: `Socio creado sin cuota: ${e instanceof Error ? e.message : 'error al asignar plan'}`,
          })
        }
      }

      created++
    } catch (e) {
      errors.push({
        row: row.rowNumber,
        message: e instanceof Error ? e.message : 'No se pudo crear el socio',
      })
    }
  }

  return { created, skipped, errors }
}
