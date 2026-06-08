import { NextResponse } from 'next/server'
import { getMobileMe } from '@/lib/mobile-member-data'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['MEMBER', 'ADMIN', 'COACH', 'TREASURER'], request)
  if (!auth.ok) return auth.response
  return NextResponse.json({ ok: true, ...(await getMobileMe(auth.session)) })
}
