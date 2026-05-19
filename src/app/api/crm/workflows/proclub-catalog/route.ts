import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProclubManifest, listProclubTemplates } from '@/lib/proclub-workflow-catalog'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const area = url.searchParams.get('area') || undefined
  const status = url.searchParams.get('status') || undefined

  const templates = listProclubTemplates({ area, status }).map((t) => ({
    proclubId: t.proclubId,
    name: t.name,
    description: t.description,
    proclubArea: t.proclubArea,
    proclubType: t.proclubType,
    implementationStatus: t.implementationStatus,
    phase: t.phase,
    triggerType: t.triggerType,
    defaultActive: t.defaultActive,
    stepCount: t.steps.length,
    notes: t.notes,
  }))

  return NextResponse.json({
    manifest: getProclubManifest(),
    templates,
  })
}
