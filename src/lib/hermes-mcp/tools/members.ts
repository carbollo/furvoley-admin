import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMember } from '@/app/actions'
import { prisma } from '@/lib/prisma'
import {
  fetchMemberById,
  fetchMembersPage,
  getMorosoMemberIds,
} from '@/lib/crm-member-mapper'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { isHermesDestructiveAllowed } from '@/lib/hermes-mcp/config'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'

export function registerMemberTools(server: McpServer) {
  server.registerTool(
    'crm_search_members',
    {
      description: 'Busca socios con paginación y filtros opcionales.',
      inputSchema: {
        page: z.number().int().min(1).optional().describe('Página (default 1)'),
        pageSize: z.number().int().min(1).max(100).optional().describe('Tamaño de página (default 20)'),
        q: z.string().optional().describe('Búsqueda por nombre, email, teléfono o DNI'),
        estado: z.string().optional().describe('Activo, Moroso, Inactivo o Todos'),
        teamId: z.string().optional().describe('Filtrar por equipo'),
      },
    },
    async (args) =>
      withHermesAudit('crm_search_members', args, async () => {
        const morosoIds = await getMorosoMemberIds(prisma)
        const page = await fetchMembersPage(prisma, {
          page: args.page ?? 1,
          pageSize: args.pageSize ?? 20,
          q: args.q,
          estado: args.estado,
          teamId: args.teamId,
          morosoIds,
        })
        return jsonToolResult(page)
      }),
  )

  server.registerTool(
    'crm_get_member',
    {
      description: 'Obtiene el detalle de un socio por ID.',
      inputSchema: {
        memberId: z.string().describe('ID del socio (cuid)'),
      },
    },
    async ({ memberId }) =>
      withHermesAudit('crm_get_member', { memberId }, async () => {
        const socio = await fetchMemberById(prisma, memberId)
        if (!socio) toolError('Socio no encontrado')
        return jsonToolResult(socio)
      }, memberId),
  )

  server.registerTool(
    'crm_create_member',
    {
      description: 'Crea un nuevo socio en el CRM.',
      inputSchema: {
        name: z.string().describe('Nombre completo'),
        email: z.string().optional(),
        phone: z.string().optional(),
        dni: z.string().optional(),
        address: z.string().optional(),
        sportPreference: z.string().optional(),
        status: z.string().optional().describe('ACTIVE, LEAD, etc.'),
      },
    },
    async (args) =>
      withHermesAudit('crm_create_member', args, async () => {
        const member = await createMember({
          name: args.name.trim(),
          email: args.email?.trim() || undefined,
          phone: args.phone?.trim() || undefined,
          dni: args.dni?.trim() || undefined,
          address: args.address?.trim() || undefined,
          sportPreference: args.sportPreference?.trim() || undefined,
          status: args.status?.trim() || undefined,
        })
        return jsonToolResult({ ok: true, id: member.id, name: member.name })
      }),
  )

  server.registerTool(
    'crm_delete_member',
    {
      description: 'Elimina un socio (solo si HERMES_ALLOW_DESTRUCTIVE=true).',
      inputSchema: {
        memberId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ memberId }) =>
      withHermesAudit('crm_delete_member', { memberId }, async () => {
        if (!(await isHermesDestructiveAllowed())) {
          toolError('Operación destructiva deshabilitada (HERMES_ALLOW_DESTRUCTIVE=false)')
        }
        const { deleteMember } = await import('@/app/actions')
        await deleteMember(memberId)
        return jsonToolResult({ ok: true, deleted: memberId })
      }, memberId),
  )
}
