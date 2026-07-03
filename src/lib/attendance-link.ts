import { prisma } from '@/lib/prisma'
import { createWorkflowResponseLink } from '@/lib/workflow-response-links'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { mapWithConcurrency } from '@/lib/concurrency'
import { ageFromBirthDate } from '@/lib/categories'

export type AttendanceLinkResult = {
  team: string
  total: number
  sent: number
  toGuardians: number
  skippedNoPhone: number
  failed: number
  warning: string | null
}

const ADULT_AGE = 18

/**
 * Formulario de asistencia del evento (roadmap · 2.3 / 5.4).
 * Envía a CADA miembro del equipo su enlace personal para confirmar su
 * asistencia; si el miembro es menor de edad, el enlace se envía al
 * familiar/tutor asignado (guardianPhone). Cada enlace marca solo la fila
 * de asistencia de ese miembro.
 */
export async function scheduleAttendanceForm(
  eventId: string,
  teamId: string,
  eventTitle: string,
  eventDate: Date,
): Promise<AttendanceLinkResult> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      name: true,
      members: {
        include: {
          member: {
            select: {
              id: true,
              name: true,
              phone: true,
              guardianName: true,
              guardianPhone: true,
              birthDate: true,
            },
          },
        },
      },
    },
  })
  const teamName = team?.name || 'Equipo'
  const members = (team?.members ?? []).map((tm) => tm.member)

  if (members.length === 0) {
    return { team: teamName, total: 0, sent: 0, toGuardians: 0, skippedNoPhone: 0, failed: 0, warning: 'El equipo no tiene miembros.' }
  }

  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) {
    return {
      team: teamName, total: members.length, sent: 0, toGuardians: 0, skippedNoPhone: 0, failed: 0,
      warning: 'WhatsApp no está configurado: no se pudieron enviar los enlaces de asistencia.',
    }
  }

  const fecha = eventDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  let sent = 0
  let toGuardians = 0
  let skippedNoPhone = 0
  let failed = 0

  await mapWithConcurrency(members, 6, async (m) => {
    // Menor de edad → familiar/tutor asignado; adulto → su propio teléfono.
    const isMinor = m.birthDate ? ageFromBirthDate(m.birthDate) < ADULT_AGE : false
    const ownPhone = m.phone?.trim() || ''
    const guardianPhone = m.guardianPhone?.trim() || ''
    const phone = isMinor ? guardianPhone || ownPhone : ownPhone || guardianPhone
    if (!phone) {
      skippedNoPhone++
      return
    }
    const viaGuardian = isMinor && !!guardianPhone

    try {
      const link = await createWorkflowResponseLink({
        type: 'ATTENDANCE',
        eventId,
        teamId,
        memberId: m.id,
        // Debe seguir vivo después de la sesión: 7 días.
        expiresInHours: 7 * 24,
      })

      const message = viaGuardian
        ? `Hola${m.guardianName?.trim() ? ` ${m.guardianName.trim()}` : ''}, confirma la asistencia de ${m.name} a «${eventTitle}» (${teamName}) del ${fecha}.\nMarca aquí: ${link.url}`
        : `Hola ${m.name}, confirma tu asistencia a «${eventTitle}» (${teamName}) del ${fecha}.\nMarca aquí: ${link.url}`

      await sendApiWassText({ sessionId, phone, message })
      sent++
      if (viaGuardian) toGuardians++
    } catch {
      failed++
    }
  })

  const warning =
    sent === 0
      ? 'No se pudo enviar ningún enlace (revisa teléfonos y la sesión de WhatsApp).'
      : skippedNoPhone > 0 || failed > 0
        ? `${skippedNoPhone ? `${skippedNoPhone} sin teléfono. ` : ''}${failed ? `${failed} envíos fallidos.` : ''}`.trim()
        : null

  return { team: teamName, total: members.length, sent, toGuardians, skippedNoPhone, failed, warning }
}
