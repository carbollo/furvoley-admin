import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { addTeamMember, setTeamCoach } from '@/app/actions/teams'
import { prisma } from '@/lib/prisma'
import { formatTeamScheduleSummary } from '@/lib/team-schedule-summary'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'

export function registerTeamTools(server: McpServer) {
  server.registerTool(
    'crm_list_teams',
    {
      description: 'Lista equipos con miembros y horarios.',
      inputSchema: {
        q: z.string().optional().describe('Filtrar por nombre'),
      },
    },
    async (args) =>
      withHermesAudit('crm_list_teams', args, async () => {
        const teams = await prisma.team.findMany({
          where: args.q?.trim()
            ? { name: { contains: args.q.trim(), mode: 'insensitive' } }
            : {},
          orderBy: { name: 'asc' },
          include: {
            members: {
              include: { member: { select: { id: true, name: true, email: true } } },
            },
            schedules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
          },
        })
        return jsonToolResult({
          equipos: teams.map((t) => ({
            id: t.id,
            nombre: t.name,
            categoria: t.category,
            horario: formatTeamScheduleSummary(t.schedules),
            miembros: t.members.map((m) => ({
              memberId: m.memberId,
              nombre: m.member.name,
              rol: m.role,
            })),
          })),
        })
      }),
  )

  server.registerTool(
    'crm_add_team_member',
    {
      description: 'Añade un socio a un equipo como jugador o entrenador.',
      inputSchema: {
        teamId: z.string(),
        memberId: z.string(),
        role: z.enum(['PLAYER', 'COACH']).optional(),
      },
    },
    async (args) =>
      withHermesAudit('crm_add_team_member', args, async () => {
        try {
          await addTeamMember({
            teamId: args.teamId,
            memberId: args.memberId,
            role: args.role ?? 'PLAYER',
          })
        } catch {
          toolError('No se pudo añadir al socio al equipo')
        }
        return jsonToolResult({ ok: true })
      }, args.memberId),
  )

  server.registerTool(
    'crm_set_team_coach',
    {
      description: 'Asigna el entrenador principal de un equipo.',
      inputSchema: {
        teamId: z.string(),
        memberId: z.string(),
      },
    },
    async (args) =>
      withHermesAudit('crm_set_team_coach', args, async () => {
        try {
          await setTeamCoach(args.teamId, args.memberId)
        } catch {
          toolError('No se pudo asignar el entrenador')
        }
        return jsonToolResult({ ok: true })
      }, args.memberId),
  )
}
