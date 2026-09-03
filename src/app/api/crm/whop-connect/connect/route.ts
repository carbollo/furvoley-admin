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
  // `choose_company` no es un error: la clave vale, pero abre varias cuentas y
  // hace falta que el admin diga cuál. Se responde con la lista, no con un 400.
  if (!validation.ok && validation.reason !== 'choose_company') {
    return NextResponse.json({ error: validation.message, reason: validation.reason }, { status: 400 })
  }

  // Cuentas que la pasarela devolvió para ESTA clave. El id del body se comprueba
  // siempre contra esta lista: nunca se acepta un identificador escrito a mano.
  const candidatas = 'companies' in validation ? validation.companies : []
  const chosen = String(body.companyId || '').trim()
  const company = chosen
    ? candidatas.find((c) => c.id === chosen)
    : validation.ok
      ? candidatas[0]
      : undefined

  if (!company) {
    return NextResponse.json(
      {
        error: validation.ok ? 'Elige cuál de tus cuentas quieres usar.' : validation.message,
        reason: 'choose_company',
        companies: candidatas,
      },
      { status: 409 },
    )
  }

  // Qué cuenta tenía ya el club, leído ANTES de tocar nada: ni la reserva en el
  // portal, ni el alta del aviso de cobro.
  //
  // Aquí y no más abajo por una razón concreta: si esta lectura falla hay que
  // abortar, y abortar después de dar de alta el aviso dejaría uno vivo en la
  // pasarela firmando con un secreto que el CRM nunca llegó a guardar. Es el
  // mismo 401 en bucle que este bloque existe para evitar.
  //
  // Y se falla CERRADO. Un fallo de lectura no es «no hay fila»: `findFirst`
  // devuelve null cuando el club nunca conectó, y lanza cuando la base no
  // responde. Confundirlos hacía que un corte de un segundo se tomara por
  // «cuenta distinta» y arrasara el estado de cobro de un club que no había
  // cambiado de cuenta. Es dinero: si no se sabe qué había, no se toca.
  let anterior: { whopCompanyId: string | null } | null
  try {
    anterior = await prisma.clubSettings.findFirst({
      where: { isDefault: true },
      select: { whopCompanyId: true },
    })
  } catch (e) {
    console.error('[whop/connect] no se pudo leer la configuración anterior', {
      code: (e as { code?: string })?.code ?? (e instanceof Error ? e.name : 'error'),
    })
    return NextResponse.json(
      {
        error:
          'No se pudo leer la configuración actual de la pasarela, así que no se ha tocado nada. Vuelve a intentarlo en unos segundos.',
      },
      { status: 503 },
    )
  }
  const mismaCuenta = Boolean(anterior?.whopCompanyId) && anterior?.whopCompanyId === company.id

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

  // Lo ÚNICO que sobrevive a una reconexión sobre la misma cuenta es el secreto
  // del aviso de cobro, y solo cuando el alta del nuevo ha fallado.
  //
  // Ese secreto sigue valiendo porque el aviso viejo continúa vivo en la
  // pasarela y firma con él. Antes se borraba siempre, y eso convertía en
  // desastre el gesto que la propia pantalla pide («vuelve a pegar la clave para
  // reintentarlo»): si el alta fallaba —un 403 pasajero basta— el CRM se quedaba
  // sin secreto, las familias pagaban, el CRM contestaba 401 y les reclamaba
  // igualmente. Y cada reintento repetía el borrado.
  //
  // El banco NO se conserva, ni siquiera sobre la misma cuenta, y es
  // deliberado: borrarlo es lo único que vuelve a comprobar a dónde va el
  // dinero. Mientras el CRM tenga un método anotado, el barrido lo usa tal cual
  // y `syncDefaultPayoutMethod` sale de inmediato — es el único punto que
  // descarta destinos rotos o retirados y reelige el predeterminado. Si el club
  // cambia de banco en la pasarela, el destino viejo se retira y volver a
  // añadirlo genera otro identificador: conservar el antiguo deja al club
  // transfiriendo a una cuenta que ya no usa, o fallando para siempre mientras
  // el CRM le dice «vuelve a conectarla en Ajustes». Borrarlo no cuesta nada: el
  // siguiente barrido lo reelige solo.
  const moneyStateReset = {
    whopChargesEnabled: false,
    whopPayoutsEnabled: false,
    whopPayoutMethodId: null,
    // La divisa describe esa cuenta bancaria concreta, no al club: viaja con
    // ella y se vuelve a anotar al reelegir destino.
    whopPayoutCurrency: null,
    whopWebhookSecret: webhook.ok ? sealSecret(webhook.secret) : mismaCuenta ? undefined : null,
    whopLastSweepAt: mismaCuenta ? undefined : null,
  }

  // Los planes espejados pertenecen a la cuenta ANTERIOR: reutilizarlos metería
  // el dinero en una cuenta que el club ya no controla. El filtro por cuenta
  // hace que esto no borre nada cuando la cuenta no ha cambiado.
  await prisma.whopPlanMapping.deleteMany({ where: { whopCompanyId: { not: company.id } } })
  // Los enlaces de pago cacheados, igual, pero solo si la cuenta cambia de
  // verdad: sobre la misma cuenta siguen siendo válidos, y tirarlos en cada
  // re-pegado obliga a recrear un enlace por factura sin ninguna ganancia.
  if (!mismaCuenta) {
    await prisma.invoice.updateMany({
      where: { whopCheckoutUrl: { not: null } },
      data: { whopCheckoutUrl: null, whopCheckoutId: null, whopCheckoutAmount: null },
    })
  }

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
    // Tres estados, no dos: true = la clave responde, false = revocada o rotada,
    // null = no se pudo comprobar ahora mismo. Aplanarlo a un booleano hacía
    // que «no lo sé» se enseñara como «no tienes ningún permiso».
    keyValid: scopeCheck.status === 'ok' ? true : scopeCheck.status === 'invalid_key' ? false : null,
    // Sin avisos de cobro la pasarela funciona, pero el CRM no se enteraría de
    // los pagos: se avisa para que el admin lo resuelva antes de cobrar.
    webhookReady: webhook.ok,
    ...(webhook.ok ? {} : { webhookError: webhook.error }),
  })
}
