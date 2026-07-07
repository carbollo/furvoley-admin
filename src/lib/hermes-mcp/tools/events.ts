import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createEventInternal } from '@/app/actions/events'
import { prisma } from '@/lib/prisma'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'

const TYPE_LABEL: Record<string, string> = {
  TRAINING: 'Entrenamiento',
  MATCH: 'Partido',
  TOURNAMENT: 'Torneo',
  SOCIAL: 'Reunión',
  OTHER: 'Otro',
}

export function registerEventTools(server: McpServer) {
  server.registerTool(
    'crm_list_events',
    {
      description: 'Lista eventos del calendario (próximos y recientes).',
      inputSchema: {
        teamId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_list_events', args, async () => {
        const now = new Date()
        const year = now.getFullYear()
        const events = await prisma.event.findMany({
          where: {
            date: { gte: new Date(year, now.getMonth() - 1, 1) },
            ...(args.teamId ? { teamId: args.teamId } : {}),
          },
          include: { team: { select: { id: true, name: true } } },
          orderBy: { date: 'asc' },
          take: args.limit ?? 40,
        })
        return jsonToolResult({
          eventos: events.map((e) => ({
            id: e.id,
            titulo: e.title,
            tipo: TYPE_LABEL[e.type] ?? e.type,
            fecha: e.date.toISOString(),
            ubicacion: e.location,
            teamId: e.teamId,
            equipo: e.team?.name ?? '',
          })),
        })
      }),
  )

  server.registerTool(
    'crm_create_event',
    {
      description: 'Crea un evento en el calendario de un equipo.',
      inputSchema: {
        title: z.string(),
        teamId: z.string(),
        date: z.string().optional(),
        type: z.string().optional(),
        location: z.string().optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_event', args, async () => {
        const title = args.title.trim()
        const teamId = args.teamId.trim()
        if (!title || !teamId) toolError('Título y equipo son obligatorios')
        const date = args.date ? new Date(args.date) : new Date()
        if (Number.isNaN(date.getTime())) toolError('Fecha inválida')
        await createEventInternal({
          title,
          type: args.type?.trim() || 'OTHER',
          date,
          location: args.location?.trim() || undefined,
          teamId,
        })
        return jsonToolResult({ ok: true })
      }),
  )
}
