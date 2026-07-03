import { prisma } from '@/lib/prisma'
import { createWorkflowResponseLink } from '@/lib/workflow-response-links'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'

export type AttendanceLinkResult = {
  team: string
  url: string
  sentTo: string | null
  warning: string | null
}

/**
 * Genera el enlace-checklist de asistencia de un evento y lo envía por
 * WhatsApp al entrenador del equipo (roadmap · Módulo 2.3 / 5.4). Las filas
 * de asistencia del evento ya existen (se siembran al crear el evento).
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
        where: { role: 'COACH' },
        include: { member: { select: { name: true, phone: true, guardianPhone: true } } },
        take: 1,
      },
    },
  })
  const teamName = team?.name || 'Equipo'

  const link = await createWorkflowResponseLink({
    type: 'ATTENDANCE',
    eventId,
    teamId,
    // La checklist debe seguir viva después de la sesión: 7 días.
    expiresInHours: 7 * 24,
  })

  const coach = team?.members[0]?.member
  const phone = coach?.phone?.trim() || coach?.guardianPhone?.trim() || ''
  if (!coach || !phone) {
    return { team: teamName, url: link.url, sentTo: null, warning: 'El equipo no tiene entrenador con teléfono; copia el enlace manualmente.' }
  }

  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) {
    return { team: teamName, url: link.url, sentTo: null, warning: 'WhatsApp no está configurado; copia el enlace manualmente.' }
  }

  const fecha = eventDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const message =
    `Hola ${coach.name}, pase de lista de «${eventTitle}» (${teamName}) del ${fecha}.\n` +
    `Marca quién vino en este enlace:\n${link.url}`

  try {
    await sendApiWassText({ sessionId, phone, message })
    return { team: teamName, url: link.url, sentTo: coach.name, warning: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fallo de WhatsApp'
    return { team: teamName, url: link.url, sentTo: null, warning: `No se pudo enviar a ${coach.name} (${msg}); copia el enlace manualmente.` }
  }
}
