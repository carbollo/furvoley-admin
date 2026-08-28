import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getClubBranding } from '@/lib/club-settings'

export const dynamic = 'force-dynamic'

/**
 * Escudo del club como IMAGEN (bytes), no como JSON.
 *
 * Existe porque los servicios externos necesitan una URL http(s) descargable:
 * ApiWass exige URL para la foto de un grupo de WhatsApp y NO admite Base64,
 * mientras que el CRM guarda el logo como data-URI en la BD del club. Esta ruta
 * hace de puente decodificando el data-URI.
 *
 * Es pública a propósito (el escudo ya se muestra en el login y en el portal de
 * socios), y `/api/public/*` no pasa por el gate de sesión del middleware.
 */
export async function GET(request: Request) {
  await enterTenantFromRequest(request)
  const branding = await getClubBranding()
  const raw = String(branding.logoUrl || '').trim()
  if (!raw) {
    return NextResponse.json({ error: 'El club no tiene escudo configurado.' }, { status: 404 })
  }

  // Caso normal: data:image/png;base64,AAAA… ([\s\S] en vez del flag `s`, que
  // el target de TS de este proyecto no admite).
  const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(raw)
  if (dataUri) {
    const [, mime, b64] = dataUri
    let bytes: Buffer
    try {
      bytes = Buffer.from(b64, 'base64')
    } catch {
      return NextResponse.json({ error: 'El escudo guardado no es una imagen válida.' }, { status: 422 })
    }
    if (bytes.length === 0) {
      return NextResponse.json({ error: 'El escudo guardado está vacío.' }, { status: 422 })
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        // Corto: si cambian el escudo, que se refresque pronto.
        'Cache-Control': 'public, max-age=300',
      },
    })
  }

  // Si algún club guardó el logo como URL, redirigimos a ella. Solo https y solo
  // a un host de verdad: esta ruta es pública y sin sesión, así que su
  // redirección es un sitio cómodo desde el que mandar a alguien a otra parte
  // con la dirección del club por delante.
  if (/^https:\/\//i.test(raw)) {
    try {
      const destino = new URL(raw)
      if (destino.protocol === 'https:' && destino.hostname.includes('.')) {
        return NextResponse.redirect(destino.toString())
      }
    } catch {
      /* URL ilegible: cae al 422 de abajo */
    }
  }

  return NextResponse.json({ error: 'Formato de escudo no reconocido.' }, { status: 422 })
}
