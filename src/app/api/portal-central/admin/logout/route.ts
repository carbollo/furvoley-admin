import { NextResponse } from 'next/server'
import { clearPortalAdminSession } from '@/lib/portal-central/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  await clearPortalAdminSession()
  return NextResponse.json({ ok: true })
}
