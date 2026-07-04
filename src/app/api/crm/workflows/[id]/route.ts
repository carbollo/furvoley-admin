import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma } from '@/generated/prisma/client'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { isWorkflowActionAllowed } from '@/lib/crm-workflow-actions'
import { isWorkflowTriggerAllowed } from '@/lib/crm-workflow-triggers'

function normalizeSteps(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((s, i) => {
    const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {}
    const actionType = String(o.actionType || '').trim()
    if (!isWorkflowActionAllowed(actionType)) {
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
  await enterTenantFromRequest(request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const existing = await prisma.workflow.findUnique({ where: { id: parsedId } })
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

  let triggerConfigUpdate: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined
  if (body.triggerConfig !== undefined) {
    triggerConfigUpdate =
      body.triggerConfig && typeof body.triggerConfig === 'object' && !Array.isArray(body.triggerConfig)
        ? (body.triggerConfig as Prisma.InputJsonValue)
        : Prisma.DbNull
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflow.update({
      where: { id: parsedId },
      data: {
        name,
        description,
        triggerType,
        ...(triggerConfigUpdate !== undefined ? { triggerConfig: triggerConfigUpdate } : {}),
        isActive,
      },
    })

    if (steps) {
      await tx.workflowStep.deleteMany({ where: { workflowId: parsedId } })
      if (steps.length > 0) {
        await tx.workflowStep.createMany({
          data: steps.map((s, i) => ({
            workflowId: parsedId,
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
  await enterTenantFromRequest(_request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const existing = await prisma.workflow.findUnique({ where: { id: parsedId } })
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await prisma.workflow.delete({ where: { id: parsedId } })

  return NextResponse.json({ ok: true })
}
