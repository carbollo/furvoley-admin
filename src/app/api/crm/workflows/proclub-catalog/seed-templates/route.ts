import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { seedProclubTemplates } from '@/lib/proclub-workflow-catalog'

export async function POST(request: Request) {
  await enterTenantFromRequest(request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await seedProclubTemplates()
  return NextResponse.json({ ok: true, ...result })
}
