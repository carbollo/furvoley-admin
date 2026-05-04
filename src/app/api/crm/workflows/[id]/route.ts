import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isWorkflowTriggerAllowed } from '@/lib/crm-workflow-triggers'

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await context.params
  const existing = await prisma.workflow.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
  }

  const name = body.name !== undefined ? String(body.name || '').trim() : existing.name
  if (!name) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const triggerType =
    body.triggerType !== undefined
      ? String(body.triggerType || '').trim()
      : existing.triggerType
  if (!isWorkflowTriggerAllowed(triggerType)) {
    return NextResponse.json({ error: 'Tipo de disparador no válido' }, { status: 400 })
  }

  let steps: ReturnType<typeof normalizeSteps> | null = null
  if (body.steps !== undefined) {
    try {
      steps = normalizeSteps(body.steps)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Pasos no válidos' },
        { status: 400 },
      )
    }
  }

  const description =
    body.description !== undefined
      ? typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null
      : existing.description

  const isActive =
    body.isActive !== undefined ? !!body.isActive : existing.isActive

  await prisma.$transaction(async (tx) => {
    await tx.workflow.update({
      where: { id },
      data: {
        name,
        description,
        triggerType,
        isActive,
      },
    })

    if (steps) {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } })
      if (steps.length > 0) {
        await tx.workflowStep.createMany({
          data: steps.map((s, i) => ({
            workflowId: id,
            position: s.position ?? i,
            stepType: s.stepType,
            actionType: s.actionType,
            config: s.config as object,
          })),
        })
      }
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await context.params
  const existing = await prisma.workflow.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await prisma.workflow.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
