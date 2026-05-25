import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireRoles } from '@/lib/rbac-api'
import {
  getHermesWhatsappStatus,
  readHermesWhatsappQrPayload,
} from '@/lib/hermes-gateway/whatsapp-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const status = await getHermesWhatsappStatus()
  if (status.status === 'CONNECTED') {
    return NextResponse.json({ ok: true, connected: true, qrImage: null, qrText: null })
  }

  const qrText = await readHermesWhatsappQrPayload()
  if (!qrText) {
    return NextResponse.json({ ok: true, connected: false, qrImage: null, qrText: null })
  }

  const qrImage = await QRCode.toDataURL(qrText, { margin: 1, width: 280 })
  return NextResponse.json({ ok: true, connected: false, qrImage, qrText })
}
