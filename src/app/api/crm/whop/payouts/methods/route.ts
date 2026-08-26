import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { listSupportedMethods, createPayoutMethod } from '@/lib/whop/payouts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Formas de cobro disponibles en el país del club y, con `methodId`, los campos
 * bancarios exactos que hay que pedirle (varían por país: IBAN, swift, etc.).
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const country = (url.searchParams.get('country') || '').trim().toUpperCase().slice(0, 2)
  const methodId = (url.searchParams.get('methodId') || '').trim()

  const result = await listSupportedMethods(country || undefined, methodId || undefined)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, methods: result.methods })
}

/** Guarda la cuenta bancaria del club con los datos que ha rellenado. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { supportedMethodId?: unknown; fields?: unknown; nickname?: unknown; currency?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const supportedMethodId = String(body.supportedMethodId || '').trim()
  if (!supportedMethodId) {
    return NextResponse.json({ error: 'Elige la forma de cobro.' }, { status: 400 })
  }

  // Los campos se validan contra los que la propia pasarela declara para este
  // método: esto decide a qué cuenta va el dinero del club, así que no se envía
  // nada que no esté en esa lista ni se recorta un valor por lo bajo.
  const declared = await listSupportedMethods(undefined, supportedMethodId)
  if (!declared.ok) return NextResponse.json({ error: declared.error }, { status: 400 })
  const spec = declared.methods.find((m) => m.id === supportedMethodId) || declared.methods[0]
  if (!spec) {
    return NextResponse.json({ error: 'Esa forma de cobro ya no está disponible.' }, { status: 400 })
  }

  const rawFields = (body.fields || {}) as Record<string, unknown>
  const fields: Record<string, string> = {}
  for (const field of spec.requiredFields) {
    const value = String(rawFields[field.id] ?? '').trim()
    if (!value) {
      if (field.required) {
        return NextResponse.json({ error: `Falta rellenar «${field.label}».` }, { status: 400 })
      }
      continue
    }
    if (value.length > 200) {
      return NextResponse.json({ error: `«${field.label}» es demasiado largo.` }, { status: 400 })
    }
    if (field.validation) {
      let re: RegExp | null = null
      try {
        re = new RegExp(field.validation)
      } catch {
        re = null
      }
      if (re && !re.test(value)) {
        return NextResponse.json({ error: `«${field.label}» no tiene el formato correcto.` }, { status: 400 })
      }
    }
    if (field.options.length > 0 && !field.options.includes(value)) {
      return NextResponse.json({ error: `«${field.label}» no es una opción válida.` }, { status: 400 })
    }
    fields[field.id] = value
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Rellena los datos de la cuenta bancaria.' }, { status: 400 })
  }

  const result = await createPayoutMethod({
    supportedMethodId,
    fields,
    nickname: typeof body.nickname === 'string' ? body.nickname : undefined,
    currency: typeof body.currency === 'string' ? body.currency : undefined,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ ok: true })
}
