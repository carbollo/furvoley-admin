import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import {
  checkApiWassNumber,
  createApiWassGroup,
  getApiWassSessionStatus,
  isWhatsAppGroupJid,
} from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { getClubBranding } from '@/lib/club-settings'
import { buildTenantPublicUrl, isPubliclyFetchable } from '@/lib/public-url'
import { mapWithConcurrency } from '@/lib/concurrency'

export const dynamic = 'force-dynamic'

/**
 * ApiWass resuelve su `check-number` con `{exists:false}` y HTTP 200 cuando su
 * propia consulta expira (7 s), así que un "no existe" real y un "no me dio
 * tiempo" llegan idénticos. Los distinguimos por el tiempo de respuesta: una
 * respuesta real es rápida; si roza el timeout del proveedor, no sabemos nada.
 */
const APIWASS_CHECK_TIMEOUT_MS = 7000
const SLOW_ANSWER_MS = 6500

type CheckState = 'on' | 'off' | 'unknown'
type Candidate = { label: string; phone: string }
type Checked = Candidate & { state: CheckState; jid: string | null }

/**
 * Crea un grupo de WhatsApp (vía ApiWass) para un grupo del organigrama.
 *
 * OJO — excepción deliberada a la contención: aquí se usan los miembros
 * DIRECTOS del grupo, NO los efectivos. Un grupo de WhatsApp es un chat
 * concreto: el del grupo padre lleva solo a su gente, y cada subgrupo tiene el
 * suyo. Si usáramos los efectivos, el chat del padre duplicaría a todos los de
 * sus subgrupos. (El resto del CRM —asistencia, convocatorias, cuotas— sí
 * agrega hacia arriba.)
 *
 * Teléfono por socio: guardianPhone || phone (igual que los envíos de workflows).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  const group = await prisma.group.findUnique({
    where: { id: parsedId },
    select: { id: true, name: true, whatsappGroupId: true },
  })
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  // Crear un segundo chat para el mismo grupo solo genera confusión (y la
  // creación no es idempotente, así que un reintento tras un timeout duplicaría).
  if (group.whatsappGroupId) {
    return NextResponse.json(
      { error: `«${group.name}» ya tiene un grupo de WhatsApp creado.` },
      { status: 409 },
    )
  }

  // Sin fallback a APIWASS_DEFAULT_SESSION_ID: en multi-tenant `process.env` es
  // global y la sesión vinculada (BD del club) es el ÚNICO límite entre clubes.
  // Caer a una sesión global crearía el grupo en la cuenta de WhatsApp de otro
  // club. Mismo criterio estricto que /api/crm/whatsapp/send.
  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || '').trim()
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Este club no tiene WhatsApp vinculado. Conecta una sesión en la pestaña WhatsApp.' },
      { status: 400 },
    )
  }

  // Miembros DIRECTOS del grupo (ver nota de cabecera: aquí no se hereda).
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: group.id },
    select: { member: { select: { name: true, phone: true, guardianPhone: true } } },
  })
  if (memberships.length === 0) {
    return NextResponse.json(
      { error: `«${group.name}» no tiene miembros propios (los de sus subgrupos van en el grupo de cada subgrupo).` },
      { status: 400 },
    )
  }

  // Agrupar por teléfono: dos socios pueden compartir número (hermanos con el
  // móvil del mismo tutor), y son UN participante, no dos.
  const porTelefono = new Map<string, string[]>()
  const sinTelefono: string[] = []
  for (const { member } of memberships) {
    const phone = String(member.guardianPhone || member.phone || '').replace(/[^\d+]/g, '')
    if (!phone) { sinTelefono.push(member.name); continue }
    const names = porTelefono.get(phone)
    if (names) names.push(member.name)
    else porTelefono.set(phone, [member.name])
  }
  const candidates: Candidate[] = [...porTelefono].map(([phone, names]) => ({
    phone,
    label: names.join(' / '),
  }))
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: `Ningún miembro de «${group.name}» tiene teléfono.` },
      { status: 400 },
    )
  }

  // Sin sesión conectada, `check-number` respondería exists=false para todos y
  // el error sería engañoso ("no están en WhatsApp"). Distinguir ambos casos.
  let status = ''
  try {
    status = await getApiWassSessionStatus(sessionId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ error: `No se pudo consultar la sesión de WhatsApp: ${msg}` }, { status: 502 })
  }
  if (status.toUpperCase() !== 'READY') {
    return NextResponse.json(
      { error: `La sesión de WhatsApp no está conectada (estado: ${status || 'desconocido'}). Escanea el QR en la pestaña WhatsApp.` },
      { status: 409 },
    )
  }

  // Validar los números ANTES de crear: WhatsApp rechaza el grupo entero con un
  // escueto "bad-request" si algún participante no existe (típico: teléfono sin
  // prefijo internacional).
  async function checkOnce(c: Candidate): Promise<Checked> {
    const startedAt = Date.now()
    try {
      const { exists, jid } = await checkApiWassNumber(sessionId, c.phone)
      if (exists) return { ...c, state: 'on', jid }
      const elapsed = Date.now() - startedAt
      // Respuesta lenta = el timeout de ApiWass disfrazado de "no existe".
      return { ...c, state: elapsed >= SLOW_ANSWER_MS ? 'unknown' : 'off', jid: null }
    } catch {
      return { ...c, state: 'unknown', jid: null }
    }
  }

  const checked = await mapWithConcurrency(candidates, 5, checkOnce)
  // Reintenta los no verificados: suelen ser picos transitorios del worker.
  const pendientes = checked
    .map((c, i) => (c.state === 'unknown' ? i : -1))
    .filter((i) => i >= 0)
  if (pendientes.length > 0) {
    const reintento = await mapWithConcurrency(pendientes.map((i) => candidates[i]), 3, checkOnce)
    reintento.forEach((r, k) => { checked[pendientes[k]] = r })
  }

  // Crear un grupo al que le falte gente real es peor que no crearlo: no hay
  // "deshacer" y reintentar duplicaría el chat. Si algo no se pudo comprobar,
  // abortamos sin tocar nada.
  const desconocidos = checked.filter((c) => c.state === 'unknown')
  if (desconocidos.length > 0) {
    return NextResponse.json(
      {
        error:
          `WhatsApp no respondió a tiempo al comprobar ${desconocidos.length} número(s) ` +
          `(${desconocidos.map((c) => c.label).join(', ')}). No se ha creado nada; vuelve a intentarlo.`,
        noVerificados: desconocidos.map((c) => c.label),
      },
      { status: 504 },
    )
  }

  const validos = checked.filter((c) => c.state === 'on')
  const noWhatsApp = checked.filter((c) => c.state === 'off').map((c) => c.label)

  if (validos.length === 0) {
    return NextResponse.json(
      {
        error:
          `Ningún teléfono de «${group.name}» está dado de alta en WhatsApp (${noWhatsApp.join(', ')}). ` +
          'Revisa que los números incluyan el prefijo internacional, p. ej. +34 600 123 456.',
        noWhatsApp,
        sinTelefono,
      },
      { status: 400 },
    )
  }

  // Foto del grupo = escudo del club. ApiWass la descarga por URL (no admite
  // Base64), así que le pasamos la ruta pública que sirve el logo del tenant.
  // Desde localhost no sería descargable: mejor no mandarla que provocar error.
  const branding = await getClubBranding()
  const logoUrl = branding.logoUrl ? buildTenantPublicUrl('/api/public/club-logo') : ''
  const image = logoUrl && isPubliclyFetchable(logoUrl) ? logoUrl : ''

  try {
    const result = await createApiWassGroup({
      sessionId,
      name: group.name,
      // El JID canónico que devuelve WhatsApp evita ambigüedades de formato,
      // pero solo si es un JID de teléfono: un LID (…@lid) no vale para crear grupo.
      participants: validos.map((v) =>
        v.jid && v.jid.endsWith('@s.whatsapp.net') ? v.jid : v.phone,
      ),
      image,
    })
    const wa = (result && typeof result === 'object' ? (result as any).group : null) ?? null
    const waJid = String(wa?.id || '').trim()
    if (!isWhatsAppGroupJid(waJid)) {
      // Sin JID no podremos enviar al chat después: mejor decirlo que fingir éxito.
      return NextResponse.json(
        { error: 'WhatsApp creó el grupo pero no devolvió su identificador. Compruébalo en el teléfono.' },
        { status: 502 },
      )
    }
    // Guardarlo es lo que habilita "Mensaje al grupo" en el organigrama.
    await prisma.group.update({
      where: { id: group.id },
      data: { whatsappGroupId: waJid, whatsappGroupCreatedAt: new Date() },
    })
    // La foto es best-effort por contrato: si falla, el grupo existe igual y
    // ApiWass explica por qué en `pictureError`. Lo contamos, no lo ocultamos.
    const pictureError = String((result as any)?.pictureError || '').trim() || null
    return NextResponse.json({
      ok: true,
      group: { id: group.id, name: group.name },
      whatsapp: { id: waJid, subject: wa?.subject ?? group.name },
      participants: validos.length,
      sinTelefono,
      noWhatsApp,
      picture: image ? (pictureError ? 'FAILED' : 'SET') : 'SKIPPED',
      pictureError,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el grupo de WhatsApp'
    // La creación no es idempotente: si ApiWass expiró esperando a WhatsApp, el
    // grupo puede existir igualmente. Avisar antes de que reintenten y dupliquen.
    return NextResponse.json(
      { error: `${msg}. Comprueba en WhatsApp si el grupo llegó a crearse antes de reintentar.` },
      { status: 502 },
    )
  }
}
