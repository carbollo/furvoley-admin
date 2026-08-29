import { prisma } from '@/lib/prisma'
import { currentHermesActor } from '@/lib/hermes-mcp/actor'

export function summarizeArgs(args: unknown, maxLen = 500) {
  try {
    const text = JSON.stringify(args)
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
  } catch {
    return String(args).slice(0, maxLen)
  }
}

export async function logHermesMcpAction(input: {
  toolName: string
  args: unknown
  memberId?: string | null
  success: boolean
  errorMessage?: string | null
}) {
  const argsSummary = summarizeArgs(input.args)
  const quien = currentHermesActor()
  try {
    await prisma.hermesMcpAuditLog.create({
      data: {
        toolName: input.toolName,
        argsSummary,
        memberId: input.memberId || null,
        success: input.success,
        errorMessage: input.errorMessage || null,
        source: 'hermes-mcp',
        // De parte de quién. Sin esto, el registro decía qué se hizo pero no
        // permitía saber quién lo pidió, que es justo lo que hace falta cuando
        // aparece un cobro que nadie recuerda.
        actor: quien.actor,
        conversationId: quien.sessionId,
      },
    })
  } catch (e) {
    console.warn('[hermes-mcp/audit]', e)
  }
}

export async function withHermesAudit<T>(
  toolName: string,
  args: unknown,
  fn: () => Promise<T>,
  memberId?: string | null,
): Promise<T> {
  try {
    const result = await fn()
    await logHermesMcpAction({ toolName, args, memberId, success: true })
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logHermesMcpAction({
      toolName,
      args,
      memberId,
      success: false,
      errorMessage: msg,
    })
    throw e
  }
}
