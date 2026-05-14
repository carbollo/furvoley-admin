import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiWassRequest } from '@/lib/apiwass'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin()
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'Session ID requerido' }, { status: 400 })
    const data = await apiWassRequest(`/sessions/${encodeURIComponent(id)}/status`)
    return NextResponse.json(data || {})
  } catch (e: any) {
    const msg = e?.message || 'No se pudo consultar el estado'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
