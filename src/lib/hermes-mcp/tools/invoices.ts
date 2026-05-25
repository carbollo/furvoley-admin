import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { recordManualInvoicePayment } from '@/app/actions/billing'
import { createMemberInvoice, createTeamInvoices } from '@/lib/crm-invoice-create'
import { prisma } from '@/lib/prisma'
import { crmInvoiceEstado } from '@/lib/invoice-display'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { isHermesDestructiveAllowed } from '@/lib/hermes-mcp/config'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'

export function registerInvoiceTools(server: McpServer) {
  server.registerTool(
    'crm_create_invoice',
    {
      description: 'Crea un cobro/factura para un socio.',
      inputSchema: {
        memberId: z.string(),
        concepto: z.string(),
        amount: z.number().positive(),
        dueDate: z.string().describe('Fecha ISO (YYYY-MM-DD)'),
        applyTax: z.boolean().optional(),
        taxRate: z.number().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_invoice', args, async () => {
        const member = await prisma.member.findUnique({
          where: { id: args.memberId },
          select: { id: true },
        })
        if (!member) toolError('Socio no encontrado')
        const invoice = await createMemberInvoice(args.memberId, args)
        return jsonToolResult({ ok: true, id: invoice.id })
      }, args.memberId),
  )

  server.registerTool(
    'crm_create_team_invoices',
    {
      description: 'Emite el mismo cobro a todos los jugadores de un equipo.',
      inputSchema: {
        teamId: z.string(),
        concepto: z.string(),
        amount: z.number().positive(),
        dueDate: z.string(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_team_invoices', args, async () => {
        const result = await createTeamInvoices(args.teamId, args)
        return jsonToolResult({ ok: true, ...result })
      }),
  )

  server.registerTool(
    'crm_list_invoices',
    {
      description: 'Lista cobros recientes con estado CRM.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        memberId: z.string().optional(),
        status: z.string().optional().describe('PENDING, PAID, OVERDUE, VOID'),
      },
    },
    async (args) =>
      withHermesAudit('crm_list_invoices', args, async () => {
        const rows = await prisma.invoice.findMany({
          where: {
            ...(args.memberId ? { memberId: args.memberId } : {}),
            ...(args.status ? { status: args.status } : {}),
          },
          include: {
            member: { select: { id: true, name: true } },
            items: { take: 1 },
          },
          orderBy: { dueDate: 'desc' },
          take: args.limit ?? 50,
        })
        return jsonToolResult({
          invoices: rows.map((inv) => ({
            id: inv.id,
            numero: inv.invoiceNumber,
            socio: inv.member.name,
            memberId: inv.memberId,
            concepto: inv.items[0]?.description ?? '',
            importe: inv.totalAmount,
            pendiente: Math.max(0, inv.totalAmount - inv.paidAmount),
            vencimiento: inv.dueDate.toISOString().slice(0, 10),
            estado: crmInvoiceEstado(inv),
            status: inv.status,
          })),
        })
      }, args.memberId),
  )

  server.registerTool(
    'crm_mark_invoice_paid',
    {
      description: 'Marca un cobro como pagado manualmente (efectivo).',
      inputSchema: {
        invoiceId: z.string(),
      },
    },
    async ({ invoiceId }) => {
      const found = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { memberId: true, totalAmount: true, paidAmount: true },
      })
      return withHermesAudit('crm_mark_invoice_paid', { invoiceId }, async () => {
        if (!found) toolError('Cobro no encontrado')
        const pending = Math.max(0, found.totalAmount - found.paidAmount)
        if (pending <= 0) toolError('Ya pagada')
        await recordManualInvoicePayment({
          invoiceId,
          amount: pending,
          method: 'CASH',
        })
        return jsonToolResult({ ok: true, invoiceId, amount: pending })
      }, found?.memberId)
    },
  )

  server.registerTool(
    'crm_delete_invoice',
    {
      description: 'Anula/elimina un cobro (solo si HERMES_ALLOW_DESTRUCTIVE=true).',
      inputSchema: { invoiceId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ invoiceId }) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, memberId: true, status: true },
      })
      return withHermesAudit(
        'crm_delete_invoice',
        { invoiceId },
        async () => {
          if (!(await isHermesDestructiveAllowed())) {
            toolError('Operación destructiva deshabilitada (HERMES_ALLOW_DESTRUCTIVE=false)')
          }
          if (!invoice) toolError('Cobro no encontrado')
          await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: 'VOID' },
          })
          return jsonToolResult({ ok: true, voided: invoiceId })
        },
        invoice?.memberId,
      )
    },
  )
}
