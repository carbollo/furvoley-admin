/**
 * La pasarela contesta en inglés: los nombres de las formas de cobro y las
 * etiquetas de los datos bancarios vienen tal cual de su API. Aquí se traducen
 * antes de enseñarlos, porque el tesorero de un club no tiene por qué leer
 * «SWIFT Code based on ISO-9362:2009» para meter el IBAN.
 *
 * Reglas de este fichero:
 *  - Lo que no esté traducido se deja en su idioma original. Es preferible una
 *    etiqueta en inglés a una inventada: la pasarela añade países y métodos sin
 *    avisar, y adivinar qué pide un banco es cómo se cometen errores caros.
 *  - Se traduce SOLO lo que se enseña. El identificador del campo y el valor de
 *    una opción viajan de vuelta a la pasarela sin tocar; traducirlos rompería
 *    el guardado de la cuenta.
 *  - Los campos se buscan primero por su identificador (`fld_…`), que la
 *    pasarela documenta como estable y seguro de fijar en código, y solo
 *    después por su etiqueta en inglés, que sí puede cambiar.
 *
 * Módulo de datos puro: lo usan el servidor (al mapear la respuesta) y la
 * pantalla (para las opciones de un desplegable, cuyo valor no se puede tocar).
 */

/** Minúsculas, sin acentos ni signos, para que la búsqueda no dependa del estilo. */
function normalizar(texto: string): string {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Los acentos se quitan, no se convierten en separador: si no, «código»
    // pasaría a «co digo» y no encontraría nada.
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const METODOS: Record<string, string> = {
  'bank deposit sepa': 'Transferencia SEPA',
  'sepa': 'Transferencia SEPA',
  'sepa bank transfer': 'Transferencia SEPA',
  'bank deposit': 'Ingreso en cuenta',
  'bank wire': 'Transferencia internacional',
  'bank wire eur': 'Transferencia internacional (EUR)',
  'bank wire usd': 'Transferencia internacional (USD)',
  'bank transfer': 'Transferencia bancaria',
  'ach': 'Transferencia ACH',
  'faster payments': 'Faster Payments (Reino Unido)',
  'instant bank transfer': 'Transferencia bancaria inmediata',
  'debit card': 'Tarjeta de débito',
  'cash pickup': 'Recogida en efectivo',
  'mobile wallet': 'Monedero móvil',
  'check': 'Cheque',
}

const CAMPOS: Record<string, { etiqueta: string; ejemplo?: string }> = {
  // --- Por identificador estable de la pasarela ---
  fld_iban: { etiqueta: 'IBAN', ejemplo: 'IBAN, sin espacios' },
  fld_swift: { etiqueta: 'Código SWIFT/BIC del banco', ejemplo: 'Código SWIFT (norma ISO-9362)' },
  fld_bic: { etiqueta: 'Código SWIFT/BIC del banco', ejemplo: 'Código SWIFT (norma ISO-9362)' },
  fld_bank_account_number: { etiqueta: 'Número de cuenta', ejemplo: 'Número de cuenta, sin espacios' },
  fld_bank_account_type: { etiqueta: 'Tipo de cuenta' },
  fld_bank_name: { etiqueta: 'Nombre del banco' },
  fld_bank_code: { etiqueta: 'Código del banco' },
  fld_branch_code: { etiqueta: 'Código de sucursal' },
  fld_routing_number: { etiqueta: 'Número de ruta (routing)' },
  fld_sort_code: { etiqueta: 'Sort code' },
  fld_account_holder_name: { etiqueta: 'Titular de la cuenta' },
  fld_first_name: { etiqueta: 'Nombre del titular' },
  fld_last_name: { etiqueta: 'Apellidos del titular' },
  fld_email: { etiqueta: 'Correo electrónico' },
  fld_phone_number: { etiqueta: 'Teléfono' },
  fld_address: { etiqueta: 'Dirección' },
  fld_city: { etiqueta: 'Ciudad' },
  fld_state: { etiqueta: 'Provincia o estado' },
  fld_postal_code: { etiqueta: 'Código postal' },
  fld_country: { etiqueta: 'País' },
  fld_date_of_birth: { etiqueta: 'Fecha de nacimiento' },
  fld_tax_id: { etiqueta: 'NIF o identificación fiscal' },
  fld_message_to_receiver: {
    etiqueta: 'Mensaje para el banco',
    ejemplo: 'Mensaje opcional para el banco receptor',
  },

  // --- Por etiqueta en inglés, para lo que llegue con otro identificador ---
  iban: { etiqueta: 'IBAN', ejemplo: 'IBAN, sin espacios' },
  'bank swift bic code': {
    etiqueta: 'Código SWIFT/BIC del banco',
    ejemplo: 'Código SWIFT (norma ISO-9362)',
  },
  'swift bic code': { etiqueta: 'Código SWIFT/BIC del banco' },
  'swift code': { etiqueta: 'Código SWIFT' },
  'bic code': { etiqueta: 'Código BIC' },
  'message to receiver': {
    etiqueta: 'Mensaje para el banco',
    ejemplo: 'Mensaje opcional para el banco receptor',
  },
  'account number': { etiqueta: 'Número de cuenta' },
  'account type': { etiqueta: 'Tipo de cuenta' },
  'account holder name': { etiqueta: 'Titular de la cuenta' },
  'bank name': { etiqueta: 'Nombre del banco' },
  'bank code': { etiqueta: 'Código del banco' },
  'branch code': { etiqueta: 'Código de sucursal' },
  'routing number': { etiqueta: 'Número de ruta (routing)' },
  'sort code': { etiqueta: 'Sort code' },
  'first name': { etiqueta: 'Nombre del titular' },
  'last name': { etiqueta: 'Apellidos del titular' },
  'full name': { etiqueta: 'Nombre completo del titular' },
  email: { etiqueta: 'Correo electrónico' },
  'email address': { etiqueta: 'Correo electrónico' },
  'phone number': { etiqueta: 'Teléfono' },
  address: { etiqueta: 'Dirección' },
  city: { etiqueta: 'Ciudad' },
  state: { etiqueta: 'Provincia o estado' },
  province: { etiqueta: 'Provincia' },
  'postal code': { etiqueta: 'Código postal' },
  'zip code': { etiqueta: 'Código postal' },
  country: { etiqueta: 'País' },
  'date of birth': { etiqueta: 'Fecha de nacimiento' },
  'tax id': { etiqueta: 'NIF o identificación fiscal' },
}

/** Ejemplos que la pasarela escribe en inglés dentro del propio campo. */
const EJEMPLOS: Record<string, string> = {
  'iban no spaces': 'IBAN, sin espacios',
  'swift code based on iso 9362 2009': 'Código SWIFT (norma ISO-9362)',
  'optional message to receiving bank': 'Mensaje opcional para el banco receptor',
  'account number no spaces': 'Número de cuenta, sin espacios',
}

/** Valores de un desplegable. Se traduce lo que se ve; el valor no se toca. */
const OPCIONES: Record<string, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorro',
  current: 'Cuenta corriente',
  business: 'Cuenta de empresa',
  personal: 'Cuenta personal',
  individual: 'Particular',
  company: 'Empresa',
}

/** Nombre de la forma de cobro, en castellano si se conoce. */
export function nombreMetodo(nombre: string): string {
  return METODOS[normalizar(nombre)] || nombre
}

/** Etiqueta del dato bancario. `id` manda sobre la etiqueta inglesa. */
export function etiquetaCampo(id: string, etiqueta: string): string {
  return (CAMPOS[String(id || '').trim()] || CAMPOS[normalizar(etiqueta)])?.etiqueta || etiqueta
}

/** Texto de ejemplo dentro del campo. */
export function ejemploCampo(id: string, etiqueta: string, ejemplo: string): string {
  const porTexto = EJEMPLOS[normalizar(ejemplo)]
  if (porTexto) return porTexto
  const conocido = CAMPOS[String(id || '').trim()] || CAMPOS[normalizar(etiqueta)]
  // Si la traducción no trae ejemplo propio, se respeta el de la pasarela: suele
  // ser un valor de muestra (un número de cuenta) que no hay que traducir.
  return conocido?.ejemplo || ejemplo
}

/** Etiqueta de una opción. El valor que se envía sigue siendo el original. */
export function etiquetaOpcion(valor: string): string {
  return OPCIONES[normalizar(valor)] || valor
}

/**
 * ¿Es una forma de cobro en criptomoneda?
 *
 * El CRM no las ofrece: un club deportivo cobra cuotas a familias y recibe el
 * dinero en su cuenta del banco. Enseñar veinte monedas entre las que está la
 * suya invita a elegir mal, y equivocarse aquí es mandar el dinero del club a
 * un sitio del que no vuelve.
 *
 * Se mira primero el tipo de entrega, que la pasarela documenta como enumerado;
 * el nombre es solo una red de seguridad por si añade alguna sin clasificar.
 */
export function esCripto(deliveryType: string, nombre: string): boolean {
  if (String(deliveryType || '').trim().toLowerCase() === 'cryptocurrency') return true
  const n = normalizar(nombre)
  return /(^| )(usdc|usdt|usdto|usd coin|usd tether|tether|bitcoin|btc|ethereum|eth|litecoin|ltc|solana|sui|tron|lightning|crypto|stablecoin)( |$)/.test(n)
}
