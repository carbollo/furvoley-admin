import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiWassRequest } from '@/lib/apiwass'
import { getWhatsAppConfig, setLinkedWhatsAppSessionId } from '@/lib/whatsapp-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET() {
  try {
    await assertAdmin()
    const data = await apiWassRequest('/sessions')
    const all = Array.isArray(data) ? data : data?.sessions || []
    const cfg = await getWhatsAppConfig()
    const linked = cfg.linkedSessionId
      ? all.find((s: any) => String(s?.id || '') === cfg.linkedSessionId)
      : null
    return NextResponse.json({ sessions: linked ? [linked] : [], linkedSessionId: cfg.linkedSessionId || null })
  } catch (e: any) {
    const msg = e?.message || 'No se pudieron cargar las sesiones'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(request: Request) {
  try {
    await assertAdmin()
    const cfg = await getWhatsAppConfig()
    if (cfg.linkedSessionId) {
      return NextResponse.json(
        { error: 'Ya existe una sesión vinculada al CRM. Elimínala para crear una nueva.' },
        { status: 409 },
      )
    }
    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    const type = String(body?.type || 'standard').trim()
    if (!id) return NextResponse.json({ error: 'Session ID requerido' }, { status: 400 })
    const created = await apiWassRequest('/sessions', { method: 'POST', body: { id, type } })
    const createdId = String(created?.id || id).trim()
    await setLinkedWhatsAppSessionId(createdId || id)
    return NextResponse.json({ ok: true, session: created, linkedSessionId: createdId || id })
  } catch (e: any) {
    const msg = e?.message || 'No se pudo crear la sesión'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
