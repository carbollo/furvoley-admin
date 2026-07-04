import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function POST(request: Request) {
  await enterTenantFromRequest(request)
  try {
    await assertAdmin()
    const body = await request.json().catch(() => ({}))
    const phone = String(body?.phone || '').trim()
    const message = String(body?.message || '').trim()
    if (!phone || !message) {
      return NextResponse.json({ error: 'Faltan teléfono o mensaje' }, { status: 400 })
    }
    const cfg = await getWhatsAppConfig()
    const sessionId = String(cfg.linkedSessionId || '').trim()
    if (!sessionId) {
      return NextResponse.json({ error: 'No hay sesión de WhatsApp vinculada al CRM.' }, { status: 409 })
    }
    const result = await sendApiWassText({ sessionId, phone, message })
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    const msg = e?.message || 'No se pudo enviar el mensaje'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
