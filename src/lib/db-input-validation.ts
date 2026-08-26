import { NextResponse } from 'next/server'

/** CUID estándar de Prisma (c + alfanumérico minúscula). */
const CUID_RE = /^c[a-z0-9]{20,32}$/

export function isCuid(value: string | null | undefined): boolean {
  return CUID_RE.test(String(value ?? '').trim())
}

export function isHexToken(value: string | null | undefined, byteLen = 24): boolean {
  const v = String(value ?? '').trim()
  return new RegExp(`^[a-f0-9]{${byteLen * 2}}$`).test(v)
}

/**
 * ¿Es UNA sola dirección de email válida? Rechaza listas (comas/;), espacios y
 * cabeceras (<>", saltos de línea) para evitar inyección de destinatarios en SMTP
 * (nodemailer parsea listas separadas por coma en el campo `to`).
 */
export function isSingleEmail(value: string | null | undefined): boolean {
  const s = String(value ?? '').trim()
  if (!s || s.length > 254) return false
  return /^[^\s@,;<>"'()\[\]]+@[^\s@,;<>"'()\[\]]+\.[^\s@,;<>"'()\[\]]+$/.test(s)
}

export function validationError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function parseCuid(
  value: string | null | undefined,
  field = 'id',
): string | NextResponse {
  const v = String(value ?? '').trim()
  if (!v) return validationError(`Falta "${field}".`)
  if (!CUID_RE.test(v)) {
    return validationError(`"${field}" no tiene un formato válido.`)
  }
  return v
}

export function parseHexToken(
  value: string | null | undefined,
  field = 'token',
  byteLen = 24,
): string | NextResponse {
  const v = String(value ?? '').trim()
  const expectedLen = byteLen * 2
  const re = new RegExp(`^[a-f0-9]{${expectedLen}}$`)
  if (!v) return validationError(`Falta "${field}".`)
  if (!re.test(v)) {
    return validationError(`"${field}" no tiene un formato válido.`)
  }
  return v
}

export function parseAccountCode(
  value: string | null | undefined,
  field = 'accountCode',
): string | NextResponse {
  const v = String(value ?? '').trim()
  if (!v) return validationError(`Falta "${field}".`)
  if (!/^\d{1,12}$/.test(v)) {
    return validationError(`"${field}" debe ser numérico (1–12 dígitos).`)
  }
  return v
}

export function parseOptionalAccountCode(
  value: string | null | undefined,
  field = 'accountCode',
): string | null | NextResponse {
  const v = String(value ?? '').trim()
  if (!v) return null
  if (!/^\d{1,12}$/.test(v)) {
    return validationError(`"${field}" debe ser numérico (1–12 dígitos).`)
  }
  return v
}

export function parseIsoDateParam(
  value: string | null | undefined,
  field: string,
): Date | null | NextResponse {
  if (!value?.trim()) return null
  const d = new Date(value.trim())
  if (Number.isNaN(d.getTime())) {
    return validationError(`Parámetro "${field}" no es una fecha ISO válida.`)
  }
  return d
}

export function parseBoundedInt(
  value: string | number | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value == null || value === '') return fallback
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function parseEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  field: string,
): T | undefined | NextResponse {
  const v = String(value ?? '').trim()
  if (!v) return undefined
  if (!allowed.includes(v as T)) {
    return validationError(`"${field}" no válido. Valores: ${allowed.join(', ')}.`)
  }
  return v as T
}

/**
 * Reglas internas para SQL nativo futuro:
 * - Prohibido `$queryRawUnsafe` / `$executeRawUnsafe`
 * - Permitido solo `Prisma.$queryRaw(Prisma.sql`...`)` con placeholders `${param}`
 */
export const RAW_SQL_POLICY = {
  forbiddenMethodSuffixes: ['queryRawUnsafe', 'executeRawUnsafe'] as const,
  allowedPattern: 'Prisma.$queryRaw(Prisma.sql`...`)',
} as const
