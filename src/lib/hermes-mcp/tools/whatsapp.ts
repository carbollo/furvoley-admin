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
        // Se devuelve al modelo para que no tutee a un menor en el móvil de su
        // madre, igual que hacen los otros dos caminos de aviso del CRM.
        let esTelefonoTutor = false
        if (args.memberId) {
          const member = await prisma.member.findUnique({
            where: { id: args.memberId },
            select: { phone: true, name: true, guardianPhone: true },
          })
          if (!member) toolError('Socio no encontrado')
          // Su móvil y, si no tiene, el del tutor: la mayoría de los socios son
          // menores sin teléfono propio, y esta era la única vía de aviso del
          // producto que no lo contemplaba, así que a los menores no se les
          // avisaba nunca.
          const propio = member.phone?.trim() || ''
          const tutor = member.guardianPhone?.trim() || ''
          phone = propio || tutor || phone
          esTelefonoTutor = !propio && Boolean(tutor)
          if (!phone) toolError('Ni el socio ni su tutor tienen teléfono registrado')
        }
        if (!phone) toolError('Indica memberId o phone')
        const message = args.message.trim()
        if (!message) toolError('El mensaje no puede estar vacío')

        await sendApiWassText({
          sessionId: args.sessionId,
          phone,
          message,
        })
        return jsonToolResult({
          ok: true,
          phone,
          esTelefonoTutor,
          ...(esTelefonoTutor
            ? { aviso: 'El número es el del tutor: dirígete a él, no al socio menor.' }
            : {}),
        })
      }, args.memberId),
  )
}
