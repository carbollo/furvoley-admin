import { prisma } from '@/lib/prisma'

/**
 * La hora de un evento, en la zona horaria del club.
 *
 * Las fechas se guardan como instantes: el navegador manda «2026-09-05T17:30Z»
 * para un partido de las 19:30 en Madrid, y eso está bien. El problema estaba al
 * volver a texto: al no pasar zona, el servidor —que corre en UTC— escribía
 * «17:30». Al tutor le llegaba por WhatsApp una convocatoria dos horas antes de
 * la real (una en invierno) y la familia se presentaba a esa hora.
 *
 * Por eso la zona SIEMPRE va explícita. `Europe/Madrid` es el valor por defecto,
 * pero se lee del club: un club fuera de España no tiene por qué heredar la
 * nuestra.
 */

const ZONA_POR_DEFECTO = 'Europe/Madrid'

/** Zona del club activo. Si no se puede leer, la de casa. */
export async function clubTimeZone(): Promise<string> {
  try {
    const s = await prisma.clubSettings.findFirst({
      where: { isDefault: true },
      select: { timezone: true },
    })
    return s?.timezone?.trim() || ZONA_POR_DEFECTO
  } catch {
    return ZONA_POR_DEFECTO
  }
}

/** «05/09/26, 19:30» */
export function formatEventInstant(date: Date, timeZone = ZONA_POR_DEFECTO): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    // Zona mal escrita en los ajustes: mejor la hora de casa que un error.
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: ZONA_POR_DEFECTO,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
}

/** Solo la hora: «19:30» */
export function formatEventTime(date: Date, timeZone = ZONA_POR_DEFECTO): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: ZONA_POR_DEFECTO,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
}

/** Solo la fecha: «05/09/2026» */
export function formatEventDate(date: Date, timeZone = ZONA_POR_DEFECTO): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: ZONA_POR_DEFECTO,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  }
}
