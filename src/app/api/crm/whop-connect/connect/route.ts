import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { validateApiKey, checkScopes, registerClubWebhook } from '@/lib/whop/connect'
import { appBaseUrl, isPubliclyFetchable } from '@/lib/public-url'
import { sealSecret } from '@/lib/whop/secret-box'
import { claimWhopCompany } from '@/lib/whop/company-claim'

/** Una API key es una cadena imprimible sin espacios ni saltos de línea. */
const API_KEY_RE = /^[\x21-\x7e]{20,200}$/

/**
 * Conecta la cuenta de la pasarela del club: recibe la API key que el admin ha
 * pegado, la valida contra la pasarela, resuelve su cuenta y la guarda cifrada.
 *
 * La key viaja del navegador al servidor una sola vez y NUNCA se devuelve: en las
 * respuestas solo va el estado y el checklist de permisos.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { apiKey?: unknown; companyId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const apiKey = String(body.apiKey || '').trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Pega la API key de tu cuenta de la pasarela.' }, { status: 400 })
  }
  if (!API_KEY_RE.test(apiKey)) {
    return NextResponse.json(
      { error: 'Esa clave no tiene el formato esperado. Cópiala entera, sin espacios ni saltos de línea.' },
      { status: 400 },
    )
  }

  const validation = await validateApiKey(apiKey)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, reason: validation.reason }, { status: 400 })
  }

  // Con varias cuentas, el club elige cuál usar; con una sola, se toma esa. El
  // id del body SIEMPRE se comprueba contra la lista que devolvió la pasarela.
  const chosen = String(body.companyId || '').trim()
  const company = chosen
    ? validation.companies.find((c) => c.id === chosen)
    : validation.companies[0]

  if (!company) {
    return NextResponse.json(
      { error: 'Elige cuál de tus cuentas quieres usar.', companies: validation.companies },
      { status: 409 },
    )
  }

  // Reserva la cuenta para este club antes de guardar nada: si otro club ya la
  // tiene, sus cobros se conciliarían en el club equivocado.
  const claim = await claimWhopCompany(company.id)
  if (!claim.ok) {
    return NextResponse.json({ error: claim.message }, { status: claim.reason === 'taken' ? 409 : 503 })
  }

  const scopeCheck = await checkScopes({ apiKey }, company.id)
  const scopes = scopeCheck.status === 'ok' ? scopeCheck.scopes : []
  const missing = scopes.filter((s) => !s.granted)

  // Avisos de cobro: sin ellos el CRM no se entera de los pagos y seguiría
  // reclamando facturas ya abonadas. Se registran contra el dominio compartido
  // del servicio, que resuelve el club por la cuenta que trae cada evento.
  // `WHOP_WEBHOOK_BASE_URL` permite fijar sin ambigüedad el servicio del CRM: si
  // se registrara el dominio del portal, los eventos llegarían al sitio donde no
  // se puede conciliar y los cobros se descartarían.
  const webhookBase = (process.env.WHOP_WEBHOOK_BASE_URL || '').trim().replace(/\/+$/, '') || appBaseUrl()
  const webhookUrl = `${webhookBase}/api/whop/webhook`
  if (!isPubliclyFetchable(webhookUrl)) {
    return NextResponse.json(
      {
        error:
          'El CRM no tiene una dirección pública configurada, así que la pasarela no podría avisar de los cobros. Avisa al proveedor del CRM.',
      },
      { status: 503 },
    )
  }
  const webhook = await registerClubWebhook({ apiKey }, company.id, webhookUrl)

  // Al (re)conectar se reinicia TODO el estado de cobro: si la cuenta cambia,
  // arrastrar el banco o el flag de cobros de la anterior emitiría cobros contra
  // una cuenta sin verificar o transferiría a un banco ajeno.
  const moneyStateReset = {
    whopChargesEnabled: false,
    whopPayoutsEnabled: false,
    whopPayoutMethodId: null,
    whopWebhookSecret: webhook.ok ? sealSecret(webhook.secret) : null,
    whopLastSweepAt: null,
  }

  // Los planes espejados y los enlaces de pago cacheados pertenecen a la cuenta
  // ANTERIOR: si se reutilizaran, el dinero entraría en una cuenta que el club ya
  // no controla. Se descartan y se vuelven a crear cuando hagan falta.
  await prisma.whopPlanMapping.deleteMany({ where: { whopCompanyId: { not: company.id } } })
  await prisma.invoice.updateMany({
    where: { whopCheckoutUrl: { not: null } },
    data: { whopCheckoutUrl: null, whopCheckoutId: null, whopCheckoutAmount: null },
  })

  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    create: {
      isDefault: true,
      name: 'ProClubCRM',
      whopCompanyId: company.id,
      whopApiKey: sealSecret(apiKey),
      whopOnboardingStatus: 'PENDING_BANK',
      whopAccountStatusAt: new Date(),
      ...moneyStateReset,
    },
    update: {
      whopCompanyId: company.id,
      whopApiKey: sealSecret(apiKey),
      whopOnboardingStatus: 'PENDING_BANK',
      whopAccountStatusAt: new Date(),
      ...moneyStateReset,
    },
  })

  return NextResponse.json({
    ok: true,
    company: { id: company.id, title: company.title },
    scopes,
    missingScopes: missing.map((s) => s.action),
    // Sin avisos de cobro la pasarela funciona, pero el CRM no se enteraría de
    // los pagos: se avisa para que el admin lo resuelva antes de cobrar.
    webhookReady: webhook.ok,
    ...(webhook.ok ? {} : { webhookError: webhook.error }),
  })
}
