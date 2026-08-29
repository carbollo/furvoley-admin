import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createSubscription } from '@/app/actions/billing'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { ROLE_LABEL, normalizeRole } from '@/lib/rbac'
import { runWorkflowTest } from '@/lib/workflow-test'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'
import { isHermesDestructiveAllowed } from '@/lib/hermes-mcp/config'
import { SUBSCRIPTION_ACTIVE_LIKE, SUBSCRIPTION_VISIBLE } from '@/lib/subscription-statuses'

function periodLabel(p: string) {
  if (p === 'QUARTERLY') return 'Trimestral'
  if (p === 'YEARLY') return 'Anual'
  return 'Mensual'
}

export function registerPhaseBTools(server: McpServer) {
  server.registerTool(
    'crm_list_membership_plans',
    {
      description: 'Lista planes de cuota y suscripciones activas.',
      inputSchema: {},
    },
    async () =>
      withHermesAudit('crm_list_membership_plans', {}, async () => {
        const [plans, subscriptions] = await Promise.all([
          prisma.membershipPlan.findMany({
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
            include: { _count: { select: { subscriptions: true } } },
          }),
          prisma.subscription.findMany({
            where: { status: { in: SUBSCRIPTION_VISIBLE } },
            include: {
              plan: true,
              member: { select: { id: true, name: true } },
            },
            take: 100,
          }),
        ])
        return jsonToolResult({
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name,
            amount: p.amount,
            billingPeriod: periodLabel(p.billingPeriod),
            isActive: p.isActive,
            subscribers: p._count.subscriptions,
          })),
          subscriptions: subscriptions.map((s) => ({
            id: s.id,
            memberId: s.memberId,
            memberName: s.member.name,
            planName: s.plan?.name,
            status: s.status,
          })),
        })
      }),
  )

  server.registerTool(
    'crm_create_subscription',
    {
      description: 'Asigna un plan de cuota a un socio.',
      inputSchema: {
        memberId: z.string(),
        planId: z.string(),
        startDate: z.string().optional(),
        autoPay: z.boolean().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_subscription', args, async () => {
        const member = await prisma.member.findUnique({ where: { id: args.memberId } })
        if (!member) toolError('Socio no encontrado')
        const plan = await prisma.membershipPlan.findUnique({ where: { id: args.planId } })
        if (!plan || !plan.isActive) toolError('Plan no encontrado o inactivo')

        // El descuento del socio va en la SUSCRIPCIÓN, y se lee en cada
        // factura, no solo en la primera. Cancelar la vieja y crear una limpia
        // se lo quitaba para siempre: a partir del mes siguiente se le cobraba
        // la cuota completa sin que nadie lo hubiera decidido.
        const anterior = await prisma.subscription.findFirst({
          where: { memberId: args.memberId, status: { in: SUBSCRIPTION_ACTIVE_LIKE } },
          select: { discountCodeId: true, discountCode: { select: { code: true } } },
        })

        await prisma.subscription.updateMany({
          where: { memberId: args.memberId, status: { in: SUBSCRIPTION_ACTIVE_LIKE } },
          data: { status: 'CANCELED', endDate: new Date() },
        })

        const subscription = await createSubscription({
          memberId: args.memberId,
          planId: args.planId,
          startDate: args.startDate ? new Date(args.startDate) : undefined,
          autoPay: args.autoPay === true,
          paymentRequiredOnEnrollment: plan.paymentRequiredOnEnrollment,
          discountCodeId: anterior?.discountCodeId ?? null,
        })
        return jsonToolResult({
          ok: true,
          subscriptionId: subscription.id,
          descuentoHeredado: anterior?.discountCode?.code ?? null,
        })
      }, args.memberId),
  )

  server.registerTool(
    'crm_get_tax_config',
    {
      description: 'Devuelve la configuración fiscal del club.',
      inputSchema: {},
    },
    async () =>
      withHermesAudit('crm_get_tax_config', {}, async () => {
        const taxConfig = await getTaxConfig()
        return jsonToolResult(taxConfig)
      }),
  )

  server.registerTool(
    'crm_list_accounting_movements',
    {
      description: 'Lista movimientos contables recientes.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        type: z.enum(['INCOME', 'EXPENSE']).optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_list_accounting_movements', args, async () => {
        const rows = await prisma.transaction.findMany({
          where: args.type ? { type: args.type } : {},
          orderBy: { date: 'desc' },
          take: args.limit ?? 50,
        })
        return jsonToolResult({
          movements: rows.map((m) => ({
            id: m.id,
            type: m.type,
            amount: m.amount,
            concept: m.description,
            date: m.date.toISOString().slice(0, 10),
            source: m.source,
          })),
        })
      }),
  )

  server.registerTool(
    'crm_create_accounting_movement',
    {
      description: 'Registra un ingreso o gasto manual simplificado (cuentas PGC por código).',
      inputSchema: {
        movementType: z.enum(['INCOME', 'EXPENSE']),
        concept: z.string(),
        amount: z.number().positive(),
        paymentAccountCode: z.string().describe('Cuenta tesorería 57/56'),
        categoryAccountCode: z.string().describe('Cuenta ingreso/gasto'),
        entryDate: z.string().optional(),
        memberId: z.string().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_accounting_movement', args, async () => {
        await ensureBasePgcAccounts()
        const taxConfig = await getTaxConfig()
        const entryDate = args.entryDate ? new Date(args.entryDate) : new Date()
        if (Number.isNaN(entryDate.getTime())) toolError('Fecha inválida')

        const applyTax =
          args.movementType === 'INCOME' ? taxConfig.applyOnIncome : taxConfig.applyOnExpense
        const taxRate =
          args.movementType === 'INCOME' ? taxConfig.vatRateIncome : taxConfig.vatRateExpense
        const taxAmount = applyTax ? Number((args.amount * (taxRate / 100)).toFixed(2)) : 0
        const totalAmount = Number((args.amount + taxAmount).toFixed(2))

        const [paymentAccount, categoryAccount] = await Promise.all([
          prisma.accountChart.findUnique({ where: { code: args.paymentAccountCode } }),
          prisma.accountChart.findUnique({ where: { code: args.categoryAccountCode } }),
        ])
        if (!paymentAccount?.isActive || !categoryAccount?.isActive) {
          toolError('Cuenta contable inválida')
        }

        const movement = await prisma.transaction.create({
          data: {
            type: args.movementType,
            amount: totalAmount,
            description: args.concept,
            date: entryDate,
            source: 'MANUAL',
          },
        })

        // El IVA necesita su propia línea o el asiento no cuadra: en un ingreso
        // con IVA entran 121 en tesorería, pero el ingreso son 100 y los otros
        // 21 son IVA repercutido, que se le debe a Hacienda. Sin esa línea,
        // `createJournalEntry` rechazaba el asiento entero.
        const lineasIva =
          taxAmount > 0
            ? [
                {
                  accountCode: args.movementType === 'INCOME' ? '4770000' : '4720000',
                  side: (args.movementType === 'INCOME' ? 'CREDIT' : 'DEBIT') as 'CREDIT' | 'DEBIT',
                  amount: taxAmount,
                  lineConcept:
                    args.movementType === 'INCOME' ? 'IVA repercutido' : 'IVA soportado',
                  memberId: args.memberId,
                },
              ]
            : []

        try {
          await createJournalEntry({
            concept: args.concept,
            entryDate,
            source: 'MANUAL',
            sourceId: movement.id,
            lines:
              args.movementType === 'INCOME'
                ? [
                    {
                      accountCode: args.paymentAccountCode,
                      side: 'DEBIT',
                      amount: totalAmount,
                      lineConcept: 'Entrada de tesorería',
                      memberId: args.memberId,
                    },
                    {
                      accountCode: args.categoryAccountCode,
                      side: 'CREDIT',
                      amount: args.amount,
                      lineConcept: 'Reconocimiento de ingreso',
                      memberId: args.memberId,
                    },
                    ...lineasIva,
                  ]
                : [
                    {
                      accountCode: args.categoryAccountCode,
                      side: 'DEBIT',
                      amount: args.amount,
                      lineConcept: 'Reconocimiento de gasto',
                      memberId: args.memberId,
                    },
                    ...lineasIva,
                    {
                      accountCode: args.paymentAccountCode,
                      side: 'CREDIT',
                      amount: totalAmount,
                      lineConcept: 'Salida de tesorería',
                      memberId: args.memberId,
                    },
                  ],
          })
        } catch (e) {
          // Si el asiento no sale, el movimiento tampoco se queda: dejar uno sin
          // el otro descuadra el libro contra el sumario, y nadie lo ve hasta el
          // cierre.
          await prisma.transaction.delete({ where: { id: movement.id } }).catch(() => {})
          throw e
        }

        return jsonToolResult({ ok: true, movementId: movement.id, iva: taxAmount })
      }, args.memberId),
  )

  server.registerTool(
    'crm_list_workflows',
    {
      description: 'Lista flujos de automatización del CRM.',
      inputSchema: { activeOnly: z.boolean().optional() },
    },
    async (args) =>
      withHermesAudit('crm_list_workflows', args, async () => {
        const workflows = await prisma.workflow.findMany({
          where: args.activeOnly ? { isActive: true } : {},
          orderBy: { name: 'asc' },
          include: { _count: { select: { steps: true } } },
        })
        return jsonToolResult({
          workflows: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            triggerType: w.triggerType,
            isActive: w.isActive,
            steps: w._count.steps,
          })),
        })
      }),
  )

  server.registerTool(
    'crm_test_workflow',
    {
      // La descripción anterior decía «modo prueba (dry-run parcial)». No lo es:
      // usa el MISMO ejecutor que producción, sin ningún parámetro de
      // simulación, así que los pasos de enviar y de cobrar se ejecutan de
      // verdad. Un modelo que lee «dry-run» lo invoca sin pedir permiso, porque
      // cree que no tiene efectos.
      description:
        'Ejecuta un flujo DE VERDAD sobre un socio real: envía WhatsApps, crea cobros y apuntes ' +
        'contables. NO es una simulación. Hay que indicar el socio o el lead concreto, y pedirle ' +
        'confirmación explícita al administrador antes de llamar.',
      inputSchema: {
        workflowId: z.string(),
        memberId: z.string().optional(),
        leadId: z.string().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_test_workflow', args, async () => {
        // Sin destinatario explícito, `runWorkflowTest` elige «el primer socio
        // activo por nombre» y le ejecuta el flujo encima. El agente no puede
        // disparar eso a ciegas.
        if (!args.memberId && !args.leadId) {
          toolError(
            'Indica sobre qué socio o lead quieres ejecutar el flujo: si no, se ejecutaría de verdad ' +
              'sobre el primer socio de la lista.',
          )
        }
        if (!(await isHermesDestructiveAllowed())) {
          toolError(
            'Ejecutar flujos está desactivado para el agente: manda mensajes y crea cobros reales. ' +
              'Actívalo en Ajustes del club o pruébalo desde el CRM.',
          )
        }
        const result = await runWorkflowTest(args.workflowId, {
          memberId: args.memberId,
          leadId: args.leadId,
        })
        return jsonToolResult(result)
      }, args.memberId),
  )

  server.registerTool(
    'crm_list_news',
    {
      description: 'Lista noticias del mural.',
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async (args) =>
      withHermesAudit('crm_list_news', args, async () => {
        const posts = await prisma.newsPost.findMany({
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: args.limit ?? 30,
          include: { author: { select: { name: true, email: true } } },
        })
        return jsonToolResult({
          posts: posts.map((p) => ({
            id: p.id,
            title: p.title,
            isPublished: p.isPublished,
            priority: p.priority,
            author: p.author?.name || p.author?.email || '',
          })),
        })
      }),
  )

  server.registerTool(
    'crm_create_news',
    {
      description: 'Publica una noticia en el mural.',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        priority: z.enum(['NORMAL', 'HIGH']).optional(),
        isPublished: z.boolean().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_news', args, async () => {
        const title = args.title.trim()
        const content = args.content.trim()
        if (!title || !content) toolError('Título y contenido son obligatorios')
        const admin = await prisma.user.findFirst({
          where: { role: 'ADMIN' },
          select: { id: true },
        })
        if (!admin) toolError('No hay usuario admin para autoría')
        const isPublished = args.isPublished !== false
        const post = await prisma.newsPost.create({
          data: {
            title,
            content,
            priority: args.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
            isPublished,
            publishedAt: isPublished ? new Date() : null,
            authorId: admin.id,
          },
        })
        return jsonToolResult({ ok: true, id: post.id })
      }),
  )

  server.registerTool(
    'crm_list_staff_users',
    {
      description: 'Lista usuarios staff (admin, entrenador, tesorero).',
      inputSchema: {},
    },
    async () =>
      withHermesAudit('crm_list_staff_users', {}, async () => {
        const users = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'COACH', 'TREASURER'] } },
          orderBy: { email: 'asc' },
          include: { member: { select: { name: true } } },
          take: 200,
        })
        return jsonToolResult({
          users: users.map((u) => {
            const role = normalizeRole(u.role)
            return {
              id: u.id,
              name: u.name,
              email: u.email,
              role,
              roleLabel: ROLE_LABEL[role],
              memberName: u.member?.name ?? '',
            }
          }),
        })
      }),
  )
}
