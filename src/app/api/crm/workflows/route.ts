import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_TRIGGER = 'MEMBER_CREATED'

const ALLOWED_ACTIONS = new Set([
  'ASSIGN_TEAM',
  'ASSIGN_TEAM_BY_AGE',
  'SET_MEMBER_STATUS',
  'CREATE_PAYMENT',
  'HTTP_REQUEST',
  'BRANCH_IF',
])

function normalizeSteps(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((s, i) => {
    const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
    const actionType = String(o.actionType || '').trim()
    if (!ALLOWED_ACTIONS.has(actionType)) {
      throw new Error(`Tipo de paso no válido: ${actionType || '(vacío)'}`)
    }
    return {
      position: typeof o.position === 'number' ? o.position : i,
      stepType: String(o.stepType || 'ACTION').trim() || 'ACTION',
      actionType,
      config:
        o.config && typeof o.config === 'object' && !Array.isArray(o.config)
          ? (o.config as object)
          : {},
    }
  })
}

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

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const triggerType = String(body.triggerType || ALLOWED_TRIGGER).trim()
  if (triggerType !== ALLOWED_TRIGGER) {
    return NextResponse.json(
      { error: 'Por ahora solo está soportado el disparador «Alta de socio»' },
      { status: 400 },
    )
  }

  let steps: ReturnType<typeof normalizeSteps>
  try {
    steps = normalizeSteps(body.steps)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Pasos no válidos' },
      { status: 400 },
    )
  }

  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null
  const isActive = body.isActive !== false

  const wf = await prisma.workflow.create({
    data: {
      name,
      description,
      triggerType,
      isActive: !!isActive,
    },
  })

  if (steps.length > 0) {
    await prisma.workflowStep.createMany({
      data: steps.map((s, i) => ({
        workflowId: wf.id,
        position: s.position ?? i,
        stepType: s.stepType,
        actionType: s.actionType,
        config: s.config as object,
      })),
    })
  }

  return NextResponse.json({ ok: true, id: wf.id })
}
