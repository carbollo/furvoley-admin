import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { installProclubTemplate } from '@/lib/proclub-workflow-install'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
  }

  const proclubId = String(body.proclubId || '').trim()
  if (!proclubId) {
    return NextResponse.json({ error: 'proclubId es obligatorio' }, { status: 400 })
  }

  const result = await installProclubTemplate({
    proclubId,
    allowDuplicate: body.allowDuplicate === true,
    forceActive: body.forceActive === true,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason || 'Error al instalar' }, { status: 400 })
  }

  return NextResponse.json(result)
}
