import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { generateDueInvoices, updateInvoiceStatuses } from '@/app/actions/billing'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  try {
    const generated = await generateDueInvoices()
    await updateInvoiceStatuses()
    return NextResponse.json({
      ok: true,
      createdCount: generated.createdCount,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al emitir cuotas'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
