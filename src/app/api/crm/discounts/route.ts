import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

const KINDS = ['PERCENT', 'FIXED'] as const

/** Normaliza un código: mayúsculas, sin espacios ni raros (HERMANOS10). */
function normalizeCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24)
}

/** Genera un código a partir de la etiqueta: FAMILIANUM-4F2A. */
function generateCode(label: string): string {
  const base = normalizeCode(label).slice(0, 12) || 'DTO'
  return `${base}-${randomBytes(2).toString('hex').toUpperCase()}`
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const discounts = await prisma.discountCode.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { subscriptions: true } } },
  })

  return NextResponse.json({
    discounts: discounts.map((d) => ({
      id: d.id,
      code: d.code,
      label: d.label,
      kind: d.kind,
      value: d.value,
      isActive: d.isActive,
      uses: d._count.subscriptions,
    })),
  })
}

/** Generador de códigos (roadmap · 6.5): etiqueta + tipo (%/fijo) + valor. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: { label?: string; kind?: string; value?: unknown; code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const label = String(body.label || '').trim()
  if (!label) return NextResponse.json({ error: 'Pon una etiqueta (ej. Hermanos, Familia numerosa)' }, { status: 400 })

  const kind = String(body.kind || 'PERCENT').toUpperCase()
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: 'Tipo no válido (porcentaje o importe fijo)' }, { status: 400 })
  }

  const value = Number(body.value)
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'Valor no válido' }, { status: 400 })
  }
  if (kind === 'PERCENT' && value > 100) {
    return NextResponse.json({ error: 'Un porcentaje no puede superar 100' }, { status: 400 })
  }

  const code = body.code?.trim() ? normalizeCode(String(body.code)) : generateCode(label)
  if (!code) return NextResponse.json({ error: 'Código no válido' }, { status: 400 })

  try {
    const created = await prisma.discountCode.create({
      data: { code, label, kind, value },
      select: { id: true, code: true },
    })
    return NextResponse.json({ ok: true, id: created.id, code: created.code })
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: `El código «${code}» ya existe` }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo crear el descuento' }, { status: 400 })
  }
}
