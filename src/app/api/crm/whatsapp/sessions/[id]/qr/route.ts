import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiWassRequest } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

function toImageSrc(data: any): string | null {
  // Important: do not infer image from raw QR text payload.
  // ApiWass responses are not always consistent in field names, so we probe known image fields only.
  const candidates = [
    data?.qrImage,
    data?.qrBase64,
    data?.image,
    data?.qr?.image,
    data?.qr?.base64,
    data?.data?.qrImage,
    data?.data?.qrBase64,
    data?.data?.image,
  ]
  const rawCandidate = candidates.find((v) => typeof v === 'string' && String(v).trim())
  const raw = String(rawCandidate || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^image\/[a-zA-Z0-9.+-]+;base64,/i.test(raw)) return `data:${raw}`
  const compact = raw.replace(/\s+/g, '')
  // base64 and base64url support
  if (/^[A-Za-z0-9+/=_-]+$/.test(compact)) return `data:image/png;base64,${compact}`
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin()
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'Session ID requerido' }, { status: 400 })
    const cfg = await getWhatsAppConfig()
    if (!cfg.linkedSessionId || cfg.linkedSessionId !== id) {
      return NextResponse.json({ error: 'Sesión no vinculada al CRM.' }, { status: 409 })
    }
    const data = await apiWassRequest(`/sessions/${encodeURIComponent(id)}/qr`)
    return NextResponse.json(
      {
        ...data,
        qrImage: toImageSrc(data),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    )
  } catch (e: any) {
    const msg = e?.message || 'No se pudo obtener el QR'
    const status = msg === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
