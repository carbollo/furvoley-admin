import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { memberCsvTemplate, parseMembersCsvContent } from '@/lib/members-csv'
import { importMembersFromCsvRows } from '@/lib/members-bulk-import'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const csv = memberCsvTemplate()
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-socios.csv"',
      'Cache-Control': 'no-store',
    },
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    csv?: string
    planId?: string
    skipExisting?: boolean
    paymentRequiredOnEnrollment?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const csv = String(body.csv || '').trim()
  if (!csv) {
    return NextResponse.json({ error: 'Falta el contenido CSV.' }, { status: 400 })
  }

  const parsed = parseMembersCsvContent(csv)
  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return NextResponse.json(
      { error: parsed.errors[0]?.message || 'CSV inválido', errors: parsed.errors },
      { status: 400 },
    )
  }

  const result = await importMembersFromCsvRows(parsed.rows, {
    planId: String(body.planId || '').trim() || undefined,
    skipExisting: body.skipExisting !== false,
    paymentRequiredOnEnrollment: body.paymentRequiredOnEnrollment,
  })

  return NextResponse.json({
    ok: true,
    ...result,
    parseErrors: parsed.errors,
    totalRows: parsed.rows.length,
  })
}
