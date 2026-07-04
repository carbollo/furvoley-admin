import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseApiWassSessionId, apiWassRequest } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await enterTenantFromRequest(_request)
  try {
    await assertAdmin()
    const { id } = await context.params
    const parsedId = parseApiWassSessionId(id, 'id')
    if (parsedId instanceof Response) return parsedId
    const cfg = await getWhatsAppConfig()
    if (!cfg.linkedSessionId || cfg.linkedSessionId !== parsedId) {
      return NextResponse.json({ error: 'Sesión no vinculada al CRM.' }, { status: 409 })
    }
    const data = await apiWassRequest(`/sessions/${encodeURIComponent(parsedId)}/logs`)
    return NextResponse.json({ logs: Array.isArray(data) ? data : data?.logs || [] })
  } catch (e: any) {
    const msg = e?.message || 'No se pudieron cargar logs'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
