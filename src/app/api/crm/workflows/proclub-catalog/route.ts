import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listProclubCatalogStatus } from '@/lib/proclub-workflow-catalog'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const entries = await listProclubCatalogStatus()
  return NextResponse.json({
    entries,
    total: entries.length,
    installed: entries.filter((e) => e.installed).length,
  })
}
