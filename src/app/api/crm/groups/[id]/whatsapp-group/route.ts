import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { createApiWassGroup } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { getEffectiveGroupMembers } from '@/lib/groups'

export const dynamic = 'force-dynamic'

/**
 * Crea un grupo de WhatsApp (vía ApiWass) para un grupo del organigrama, con
 * sus socios EFECTIVOS (directos + los de sus subgrupos, por contención). El
 * grupo de WhatsApp se llama como el grupo del CRM. Teléfono usado por socio:
 * guardianPhone || phone (igual que los envíos de workflows).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  const group = await prisma.group.findUnique({
    where: { id: parsedId },
    select: { id: true, name: true },
  })
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) {
    return NextResponse.json(
      { error: 'WhatsApp no está configurado. Vincula una sesión de ApiWass en la pestaña WhatsApp.' },
      { status: 400 },
    )
  }

  const effective = await getEffectiveGroupMembers(group.id)
  if (effective.length === 0) {
    return NextResponse.json(
      { error: `«${group.name}» no tiene miembros (ni directos ni en subgrupos).` },
      { status: 400 },
    )
  }

  const memberRows = await prisma.member.findMany({
    where: { id: { in: effective.map((m) => m.memberId) } },
    select: { name: true, phone: true, guardianPhone: true },
  })
  const phones: string[] = []
  const sinTelefono: string[] = []
  for (const m of memberRows) {
    const phone = String(m.guardianPhone || m.phone || '').replace(/[^\d+]/g, '')
    if (phone) phones.push(phone)
    else sinTelefono.push(m.name)
  }
  if (phones.length === 0) {
    return NextResponse.json(
      { error: `Ningún miembro de «${group.name}» tiene teléfono.` },
      { status: 400 },
    )
  }

  try {
    const result = await createApiWassGroup({ sessionId, name: group.name, participants: phones })
    const wa = (result && typeof result === 'object' ? (result as any).group : null) ?? null
    return NextResponse.json({
      ok: true,
      group: { id: group.id, name: group.name },
      whatsapp: { id: wa?.id ?? null, subject: wa?.subject ?? group.name },
      participants: phones.length,
      sinTelefono,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el grupo de WhatsApp'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
