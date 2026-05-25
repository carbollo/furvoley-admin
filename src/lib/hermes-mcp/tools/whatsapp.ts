import * as z from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { sendApiWassText } from '@/lib/apiwass'
import { prisma } from '@/lib/prisma'
import { withHermesAudit } from '@/lib/hermes-mcp/audit'
import { jsonToolResult, toolError } from '@/lib/hermes-mcp/tools/helpers'

export function registerWhatsAppTools(server: McpServer) {
  server.registerTool(
    'crm_send_whatsapp_member',
    {
      description:
        'Envía un WhatsApp a un socio vía ApiWass (canal operativo del club, no el WhatsApp de Hermes).',
      inputSchema: {
        memberId: z.string().optional().describe('ID del socio; si se omite, usa phone'),
        phone: z.string().optional(),
        message: z.string(),
        sessionId: z.string().optional().describe('Sesión ApiWass (opcional)'),
      },
    },
    async (args) =>
      withHermesAudit('crm_send_whatsapp_member', args, async () => {
        let phone = args.phone?.trim() || ''
        if (args.memberId) {
          const member = await prisma.member.findUnique({
            where: { id: args.memberId },
            select: { phone: true, name: true },
          })
          if (!member) toolError('Socio no encontrado')
          phone = member.phone?.trim() || phone
          if (!phone) toolError('El socio no tiene teléfono')
        }
        if (!phone) toolError('Indica memberId o phone')
        const message = args.message.trim()
        if (!message) toolError('El mensaje no puede estar vacío')

        await sendApiWassText({
          sessionId: args.sessionId,
          phone,
          message,
        })
        return jsonToolResult({ ok: true, phone })
      }, args.memberId),
  )
}
