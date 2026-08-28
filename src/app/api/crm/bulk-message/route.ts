import { NextResponse } from 'next/server'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { runBulkMessageWorkflows } from '@/lib/workflow-proclub-runners'

/**
 * Manda un mensaje a todos los socios de un grupo.
 *
 * El rol no basta aquí: un entrenador es entrenador **de sus equipos**, y el
 * grupo llega en el cuerpo de la petición. Sin comprobar de qué equipo es, un
 * COACH podía escribirle al grupo raíz —es decir, al club entero, tutores y
 * teléfonos de menores incluidos— con la identidad del club.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: { groupId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const groupId = parseCuid(String(body.groupId || '').trim(), 'groupId')
  if (groupId instanceof Response) return groupId

  const message = String(body.message || '').trim()
  if (!message) {
    return NextResponse.json({ error: 'groupId y message son obligatorios' }, { status: 400 })
  }

  const denied = await assertTeamAccess(auth, groupId)
  if (denied) return denied

  await runBulkMessageWorkflows(groupId, message)
  return NextResponse.json({ ok: true })
}
