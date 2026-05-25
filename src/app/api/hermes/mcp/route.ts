import { NextResponse } from 'next/server'
import { verifyHermesMcpAuth } from '@/lib/hermes-mcp/auth'
import { checkHermesMcpRateLimit } from '@/lib/hermes-mcp/rate-limit'
import { handleHermesMcpRequest } from '@/lib/hermes-mcp/session-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guard(request: Request) {
  const auth = await verifyHermesMcpAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }
  const rate = checkHermesMcpRateLimit(request, auth.apiKey)
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit excedido' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }
  return null
}

export async function GET(request: Request) {
  const denied = await guard(request)
  if (denied) return denied
  return handleHermesMcpRequest(request)
}

export async function POST(request: Request) {
  const denied = await guard(request)
  if (denied) return denied
  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    parsedBody = undefined
  }
  return handleHermesMcpRequest(request, parsedBody)
}

export async function DELETE(request: Request) {
  const denied = await guard(request)
  if (denied) return denied
  return handleHermesMcpRequest(request)
}
