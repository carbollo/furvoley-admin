import { NextResponse } from 'next/server'
import { getClubBranding } from '@/lib/club-settings'

export const dynamic = 'force-dynamic'

/** Branding público del club (nombre, logo, color) para el panel de socios. */
export async function GET() {
  const branding = await getClubBranding()
  return NextResponse.json(
    {
      branding: {
        name: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        subtitle: branding.subtitle,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
