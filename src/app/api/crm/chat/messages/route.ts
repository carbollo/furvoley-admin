import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { sendApiWassGroupText, sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { getEffectiveGroupMembers } from '@/lib/groups'
import { mapWithConcurrency } from '@/lib/concurrency'

export const dynamic = 'force-dynamic'

function threadFilter(url: URL): { memberId?: string; groupId?: string } | Response {
  const memberIdRaw = String(url.searchParams.get('memberId') || '').trim()
  const groupIdRaw = String(url.searchParams.get('groupId') || '').trim()
  if (memberIdRaw) {
    const parsed = parseCuid(memberIdRaw, 'memberId')
    if (parsed instanceof Response) return parsed
    return { memberId: parsed }
  }
  if (groupIdRaw) {
    const parsed = parseCuid(groupIdRaw, 'groupId')
    if (parsed instanceof Response) return parsed
    return { groupId: parsed }
  }
  return NextResponse.json({ error: 'Indica memberId o groupId' }, { status: 400 })
}

/** Mensajes de un hilo (1 a 1 o grupo), del más antiguo al más nuevo. */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const filter = threadFilter(new URL(request.url))
  if (filter instanceof Response) return filter

  const rows = await prisma.chatMessage.findMany({
    where: filter,
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      status: m.status,
      error: m.error,
      at: m.createdAt.toISOString(),
    })),
  })
}

async function resolveSessionId(): Promise<string> {
  const waCfg = await getWhatsAppConfig()
  return String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
}

/**
 * Envía un mensaje al hilo: 1 a 1 (memberId) o difusión al grupo (groupId,
 * llega a todos los miembros efectivos con teléfono). Se registra en el
 * historial local del chat.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { memberId?: string; groupId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const message = String(body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })
  if (message.length > 4000) {
    return NextResponse.json({ error: 'Mensaje demasiado largo (máx. 4000 caracteres)' }, { status: 400 })
  }

  const sessionId = await resolveSessionId()
  if (!sessionId) {
    return NextResponse.json(
      { error: 'WhatsApp no está configurado. Vincula una sesión en «Conexión» o define APIWASS_DEFAULT_SESSION_ID.' },
      { status: 409 },
    )
  }

  // ── Hilo 1 a 1 ──
  if (body.memberId) {
    const parsed = parseCuid(String(body.memberId), 'memberId')
    if (parsed instanceof Response) return parsed
    const member = await prisma.member.findUnique({
      where: { id: parsed },
      select: { id: true, name: true, phone: true, guardianPhone: true },
    })
    if (!member) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
    const phone = member.phone?.trim() || member.guardianPhone?.trim() || ''
    if (!phone) return NextResponse.json({ error: `${member.name} no tiene teléfono guardado.` }, { status: 400 })

    let status = 'SENT'
    let error: string | null = null
    try {
      await sendApiWassText({ sessionId, phone, message })
    } catch (e) {
      status = 'FAILED'
      error = e instanceof Error ? e.message : 'Fallo de envío'
    }
    const row = await prisma.chatMessage.create({
      data: { memberId: member.id, body: message, status, error },
    })
    if (status === 'FAILED') {
      return NextResponse.json({ error: `No se pudo enviar: ${error}`, messageId: row.id }, { status: 502 })
    }
    return NextResponse.json({ ok: true, messageId: row.id })
  }

  // ── Hilo de grupo ──
  if (body.groupId) {
    const parsed = parseCuid(String(body.groupId), 'groupId')
    if (parsed instanceof Response) return parsed
    const group = await prisma.group.findUnique({
      where: { id: parsed },
      select: { id: true, name: true, whatsappGroupId: true },
    })
    if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

    // Si el grupo tiene su chat de WhatsApp, el mensaje va UNA vez a ese chat:
    // todos lo ven en la misma conversación y pueden responderse entre ellos.
    if (group.whatsappGroupId) {
      let status = 'SENT'
      let error: string | null = null
      try {
        await sendApiWassGroupText({ sessionId, groupJid: group.whatsappGroupId, message })
      } catch (e) {
        status = 'FAILED'
        error = e instanceof Error ? e.message : 'Fallo de envío'
      }
      const row = await prisma.chatMessage.create({
        data: { groupId: group.id, body: message, status, error },
      })
      if (status === 'FAILED') {
        return NextResponse.json(
          { error: `No se pudo enviar al grupo de WhatsApp: ${error}`, messageId: row.id },
          { status: 502 },
        )
      }
      return NextResponse.json({ ok: true, messageId: row.id, viaGroupChat: true })
    }

    // Sin chat de grupo: difusión 1 a 1 a los miembros efectivos (comportamiento
    // histórico, lo sigue usando la pestaña Chat en grupos sin grupo de WhatsApp).
    const effective = await getEffectiveGroupMembers(parsed)
    const withPhone = await prisma.member.findMany({
      where: { id: { in: effective.map((m) => m.memberId) } },
      select: { id: true, phone: true, guardianPhone: true },
    })
    const targets = withPhone
      .map((m) => ({ id: m.id, phone: m.phone?.trim() || m.guardianPhone?.trim() || '' }))
      .filter((t) => t.phone)

    let sent = 0
    let failed = 0
    await mapWithConcurrency(targets, 6, async (t) => {
      try {
        await sendApiWassText({ sessionId, phone: t.phone, message })
        sent++
      } catch {
        failed++
      }
    })
    const skippedNoPhone = effective.length - targets.length

    const status = sent === 0 ? 'FAILED' : failed > 0 || skippedNoPhone > 0 ? 'PARTIAL' : 'SENT'
    const error =
      status === 'SENT'
        ? null
        : `Enviados ${sent}/${effective.length}${skippedNoPhone ? ` · ${skippedNoPhone} sin teléfono` : ''}${failed ? ` · ${failed} fallidos` : ''}`
    const row = await prisma.chatMessage.create({
      data: { groupId: group.id, body: message, status, error },
    })

    return NextResponse.json({ ok: sent > 0, messageId: row.id, sent, failed, skippedNoPhone, total: effective.length })
  }

  return NextResponse.json({ error: 'Indica memberId o groupId' }, { status: 400 })
}
