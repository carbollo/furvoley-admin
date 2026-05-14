import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiWassRequest } from '@/lib/apiwass'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET() {
  try {
    await assertAdmin()
    const data = await apiWassRequest('/sessions')
    return NextResponse.json({ sessions: Array.isArray(data) ? data : data?.sessions || [] })
  } catch (e: any) {
    const msg = e?.message || 'No se pudieron cargar las sesiones'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(request: Request) {
  try {
    await assertAdmin()
    const existingRaw = await apiWassRequest('/sessions')
    const existing = Array.isArray(existingRaw) ? existingRaw : existingRaw?.sessions || []
    if (existing.length > 0) {
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
    return NextResponse.json({ ok: true, session: created })
  } catch (e: any) {
    const msg = e?.message || 'No se pudo crear la sesión'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
