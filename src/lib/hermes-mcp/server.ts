import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerEventTools } from '@/lib/hermes-mcp/tools/events'
import { registerInvoiceTools } from '@/lib/hermes-mcp/tools/invoices'
import { registerKpiTools } from '@/lib/hermes-mcp/tools/kpis'
import { registerMemberTools } from '@/lib/hermes-mcp/tools/members'
import { registerPhaseBTools } from '@/lib/hermes-mcp/tools/phase-b'
import { registerTeamTools } from '@/lib/hermes-mcp/tools/teams'
import { registerWhatsAppTools } from '@/lib/hermes-mcp/tools/whatsapp'

const INSTRUCTIONS = `Eres el agente Hermes conectado al CRM Furvoley vía MCP.

Reglas:
- Responde en español salvo que el admin escriba en otro idioma.
- Confirma importes y datos sensibles antes de crear cobros o altas masivas.
- WhatsApp Hermes (este chat) es solo para control admin; para avisar a socios usa crm_send_whatsapp_member (ApiWass).
- No borres socios ni cobros salvo petición explícita del admin.
- Usa crm_search_members antes de actuar sobre un socio si solo tienes el nombre.
- Para cobros de equipo usa crm_create_team_invoices.
`

export function createHermesMcpServer() {
  const server = new McpServer(
    { name: 'furvoley-crm', version: '1.0.0' },
    {
      instructions: INSTRUCTIONS,
      capabilities: { tools: {} },
    },
  )

  registerKpiTools(server)
  registerMemberTools(server)
  registerInvoiceTools(server)
  registerTeamTools(server)
  registerEventTools(server)
  registerWhatsAppTools(server)
  registerPhaseBTools(server)

  return server
}
