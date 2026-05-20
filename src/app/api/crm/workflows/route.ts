import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

  const triggerType = String(body.triggerType || 'MEMBER_CREATED').trim()
  if (!isWorkflowTriggerAllowed(triggerType)) {
    return NextResponse.json({ error: 'Tipo de disparador no válido' }, { status: 400 })
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

  let triggerConfig: object | undefined
  if (body.triggerConfig && typeof body.triggerConfig === 'object' && !Array.isArray(body.triggerConfig)) {
    triggerConfig = body.triggerConfig as object
  }

  const wf = await prisma.workflow.create({
    data: {
      name,
      description,
      triggerType,
      triggerConfig,
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
