import { prisma } from '@/lib/prisma'
import { createWorkflowResponseLink } from '@/lib/workflow-response-links'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { mapWithConcurrency } from '@/lib/concurrency'
import { ageFromBirthDate } from '@/lib/categories'
import { effectiveGroupMemberIds } from '@/lib/groups'

export type AttendanceLinkResult = {
  group: string
  total: number
  sent: number
  toGuardians: number
  skippedNoPhone: number
  failed: number
  warning: string | null
  /**
   * El fallo es RECUPERABLE (WhatsApp aún sin conectar, o todos los envíos
   * fallaron de forma transitoria): no debe marcarse el evento como enviado
   * para que el cron reintente. false = terminado (enviado o nada que enviar).
   */
  recoverable: boolean
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
  groupId: string,
  eventTitle: string,
  eventDate: Date,
): Promise<AttendanceLinkResult> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true },
  })
  const teamName = group?.name || 'Grupo'

  // Miembros efectivos del grupo (directos + de sus subgrupos, por contención).
  const memberIds = await effectiveGroupMemberIds(groupId)
  const members = memberIds.length
    ? await prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: {
          id: true,
          name: true,
          phone: true,
          guardianName: true,
          guardianPhone: true,
          birthDate: true,
        },
      })
    : []

  if (members.length === 0) {
    return { group: teamName, total: 0, sent: 0, toGuardians: 0, skippedNoPhone: 0, failed: 0, warning: 'El grupo no tiene miembros.', recoverable: false }
  }

  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) {
    return {
      group: teamName, total: members.length, sent: 0, toGuardians: 0, skippedNoPhone: 0, failed: 0,
      warning: 'WhatsApp no está configurado: no se pudieron enviar los enlaces de asistencia.',
      recoverable: true,
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
        groupId,
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

  // Todos los envíos fallaron (0 enviados y hubo fallos) → transitorio → reintentar.
  const recoverable = sent === 0 && failed > 0
  return { group: teamName, total: members.length, sent, toGuardians, skippedNoPhone, failed, warning, recoverable }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Días de antelación permitidos para el formulario de asistencia. */
export const ATTENDANCE_REMINDER_DAYS = [1, 3, 7, 15, 30] as const
export type AttendanceReminderDays = (typeof ATTENDANCE_REMINDER_DAYS)[number]

export function isAttendanceReminderDays(n: unknown): n is AttendanceReminderDays {
  return typeof n === 'number' && (ATTENDANCE_REMINDER_DAYS as readonly number[]).includes(n)
}

/** Fecha a la que debe enviarse el formulario: `eventDate - reminderDays`. */
export function attendanceFormSendDate(eventDate: Date, reminderDays: number): Date {
  return new Date(eventDate.getTime() - reminderDays * DAY_MS)
}

/**
 * Envía el formulario de asistencia de UN evento y marca `attendanceFormSentAt`
 * para no reenviarlo. Reutilizado por el envío inmediato (al crear el evento si
 * la ventana ya pasó) y por el cron. Devuelve null si el evento no existe o no
 * tiene equipo.
 */
export async function sendAttendanceFormForEvent(eventId: string): Promise<AttendanceLinkResult | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, date: true, groupId: true, attendanceFormSentAt: true },
  })
  if (!event?.groupId || event.attendanceFormSentAt) return null

  const result = await scheduleAttendanceForm(event.id, event.groupId, event.title, event.date)
  // Fallo recuperable (WhatsApp sin conectar, o todos los envíos fallaron): NO
  // marcar → el cron reintentará en el próximo tick (hasta que el evento pase).
  // Fallos parciales (algunos sin teléfono) SÍ marcan: no reintentamos el envío
  // masivo cada hora (evita spam a las familias con teléfono).
  if (result.recoverable) return result

  await prisma.event.update({
    where: { id: event.id },
    data: { attendanceFormSentAt: new Date() },
  })
  return result
}

export type DueAttendanceSummary = {
  processed: number
  results: { eventId: string; title: string; result: AttendanceLinkResult | null }[]
}

/**
 * Envía los formularios de asistencia cuya ventana de antelación ya ha llegado.
 * Debe ejecutarse dentro del contexto del tenant (el cron itera por tenant).
 *
 * Criterio: formulario activado, aún no enviado, evento futuro (no pasado ni
 * cancelado) y `ahora >= fecha - reminderDays`.
 */
export async function dispatchDueAttendanceForms(now: Date = new Date()): Promise<DueAttendanceSummary> {
  const candidates = await prisma.event.findMany({
    where: {
      attendanceFormEnabled: true,
      attendanceFormSentAt: null,
      status: 'SCHEDULED',
      date: { gte: now },
      groupId: { not: null },
    },
    select: { id: true, title: true, date: true, attendanceReminderDays: true },
    orderBy: { date: 'asc' },
    take: 500,
  })

  const due = candidates.filter((e) => {
    const days = e.attendanceReminderDays ?? 0
    if (!days) return false
    return now.getTime() >= attendanceFormSendDate(e.date, days).getTime()
  })

  const results: DueAttendanceSummary['results'] = []
  for (const e of due) {
    // Un fallo en un evento no debe abortar el resto del tenant.
    try {
      const result = await sendAttendanceFormForEvent(e.id)
      results.push({ eventId: e.id, title: e.title, result })
    } catch {
      results.push({ eventId: e.id, title: e.title, result: null })
    }
  }
  return { processed: results.length, results }
}
