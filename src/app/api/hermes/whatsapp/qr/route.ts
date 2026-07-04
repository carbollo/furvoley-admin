import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireRoles } from '@/lib/rbac-api'
import {
  getHermesWhatsappStatus,
  readHermesWhatsappQrPayload,
} from '@/lib/hermes-gateway/whatsapp-status'
import { startWhatsappPairingIfNeeded } from '@/lib/hermes-gateway/whatsapp-pairing'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let status = await getHermesWhatsappStatus()
  if (status.status === 'DISCONNECTED' || status.status === 'PAIRING') {
    await startWhatsappPairingIfNeeded()
    status = await getHermesWhatsappStatus()
  }

  if (status.status === 'CONNECTED') {
    return NextResponse.json({ ok: true, connected: true, qrImage: null, qrText: null, status })
  }

  const qrText = await readHermesWhatsappQrPayload()
  if (!qrText) {
    return NextResponse.json({
      ok: true,
      connected: false,
      qrImage: null,
      qrText: null,
      status,
      hint:
        status.pairingActive || status.status === 'PAIRING'
          ? 'Generando QR… espera unos segundos y recarga.'
          : 'Guarda la configuración con Hermes activo para iniciar el emparejamiento.',
    })
  }

  const qrImage = await QRCode.toDataURL(qrText, { margin: 1, width: 280 })
  return NextResponse.json({ ok: true, connected: false, qrImage, qrText, status })
}
