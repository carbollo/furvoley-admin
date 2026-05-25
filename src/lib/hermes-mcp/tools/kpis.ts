import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { prisma } from '@/lib/prisma'
import { getMemberStatsAccurate } from '@/lib/crm-member-mapper'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { jsonToolResult } from '@/lib/hermes-mcp/tools/helpers'

export function registerKpiTools(server: McpServer) {
  server.registerTool(
    'crm_get_kpis',
    {
      description: 'Obtiene KPIs del CRM: socios activos, morosos, cobros pendientes e ingresos del mes.',
      inputSchema: {},
    },
    async () =>
      withHermesAudit('crm_get_kpis', {}, async () => {
        const memberStats = await getMemberStatsAccurate(prisma)
        const now = new Date()
        const year = now.getFullYear()
        const monthStart = new Date(year, now.getMonth(), 1)
        const monthEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999)

        const [pendingInvoices, overdueCount, incomeTxMonth] = await Promise.all([
          prisma.invoice.findMany({
            where: { status: { notIn: ['PAID', 'VOID'] } },
            select: { totalAmount: true, paidAmount: true },
          }),
          prisma.invoice.count({
            where: { status: 'OVERDUE' },
          }),
          prisma.transaction.findMany({
            where: {
              type: 'INCOME',
              date: { gte: monthStart, lte: monthEnd },
            },
            select: { amount: true },
          }),
        ])

        const pendingAmount = pendingInvoices.reduce(
          (a, i) => a + Math.max(0, i.totalAmount - i.paidAmount),
          0,
        )
        const ingresosMes = incomeTxMonth.reduce((a, t) => a + t.amount, 0)

        return jsonToolResult({
          sociosActivos: memberStats.activos,
          sociosTotal: memberStats.total,
          sociosMorosos: memberStats.morosos,
          cuotaPromedio: memberStats.cuotaPromedio,
          cobrosPendientes: pendingInvoices.length,
          cobrosPendientesMonto: Number(pendingAmount.toFixed(2)),
          facturasVencidas: overdueCount,
          ingresosMes: Number(ingresosMes.toFixed(2)),
        })
      }),
  )
}
