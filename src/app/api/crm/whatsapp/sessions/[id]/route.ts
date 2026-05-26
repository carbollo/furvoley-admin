import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseApiWassSessionId, apiWassRequest } from '@/lib/apiwass'
import { getWhatsAppConfig, setLinkedWhatsAppSessionId } from '@/lib/whatsapp-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin()
    const { id } = await context.params
    const parsedId = parseApiWassSessionId(id, 'id')
    if (parsedId instanceof Response) return parsedId
    const cfg = await getWhatsAppConfig()
    if (!cfg.linkedSessionId || cfg.linkedSessionId !== parsedId) {
      return NextResponse.json({ error: 'Solo puedes eliminar la sesión vinculada al CRM.' }, { status: 409 })
    }
    await apiWassRequest(`/sessions/${encodeURIComponent(parsedId)}`, { method: 'DELETE' })
    await setLinkedWhatsAppSessionId(null)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const msg = e?.message || 'No se pudo eliminar la sesión'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
