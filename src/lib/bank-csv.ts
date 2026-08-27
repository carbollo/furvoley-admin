/** Parsea extractos CSV bancarios (delimitador ; o ,, importes ES/EN, fechas comunes). */

export type BankCsvParseResult = {
  rows: {
    date: Date
    signedAmount: number
    description: string
    reference: string | null
    raw: string[]
  }[]
  warnings: string[]
}

function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === delimiter) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

function normalizeHeader(h: string) {
  return h
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseAmountCell(raw: string): number | null {
  let s = raw.trim().replace(/^"|"$/g, '').replace(/\s/g, '')
  if (!s) return null
  // (1.234,56) o -1.234,56
  let neg = false
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    neg = true
    s = s.slice(1)
  }
  // 1.234,56 europeo
  if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return neg ? -n : n
}

/**
 * Fecha de una celda del extracto, siempre en orden español (día primero).
 *
 * El año de dos cifras es la trampa: `05/03/26` no encajaba con el patrón de
 * cuatro dígitos y acababa en `Date.parse`, que lo lee a la americana y lo
 * convierte en el 3 de mayo en vez del 5 de marzo. Con eso, los movimientos
 * aterrizaban en el mes equivocado y el cuadre no salía por ninguna parte.
 */
function parseDateCell(raw: string): Date | null {
  const s = raw.trim().replace(/^"|"$/g, '')
  if (!s) return null

  // yyyy-MM-dd (ISO, sin ambigüedad posible)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy y sus versiones de año corto.
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const rawYear = parseInt(m[3], 10)
    // Un extracto bancario siempre es de este siglo.
    const year = m[3].length === 2 ? 2000 + rawYear : rawYear
    if (day < 1 || day > 31 || month < 0 || month > 11) return null
    const d = new Date(year, month, day)
    // Rechaza fechas imposibles tipo 31/02: el Date las desborda al mes siguiente.
    if (d.getDate() !== day || d.getMonth() !== month) return null
    return Number.isNaN(d.getTime()) ? null : d
  }

  // Cualquier otro formato es ambiguo: mejor omitir la fila (y avisar de ello)
  // que colar una fecha inventada en la contabilidad del club.
  return null
}

const DATE_KEYS = ['fecha', 'date', 'fecha valor', 'fechavalor', 'data', 'booking date']
const AMOUNT_KEYS = ['importe', 'amount', 'cantidad', 'cargoabono', 'movimiento']
const DESC_KEYS = ['concepto', 'description', 'descripcion', 'detalle', 'concept', 'label']
const REF_KEYS = ['referencia', 'reference', 'numero', 'numero operacion', 'id']

function findCol(headers: string[], keys: string[]): number {
  const norm = headers.map(normalizeHeader)
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i]
    if (keys.some((k) => h === k || h.includes(k))) return i
  }
  return -1
}

export type BankCsvColumnas = {
  date: number
  amount: number
  description: number
  reference: number
}

export type BankCsvPreview = {
  ok: boolean
  error?: string
  delimiter: ';' | ','
  cabeceras: string[]
  /** Columnas detectadas; -1 cuando no se ha reconocido ninguna. */
  detectado: BankCsvColumnas
  /** Se reconocieron las cabeceras, o se está adivinando por posición. */
  reconocido: boolean
  /** Primeras filas en crudo, para que el usuario compruebe qué es cada columna. */
  muestra: string[][]
  totalFilas: number
}

/**
 * Lee el fichero sin importar nada, para poder enseñar qué ha entendido.
 *
 * Si el banco exporta con cabeceras que el importador no conoce, se caía a
 * suponer Fecha=0, Concepto=1, Importe=2 y lo importaba igual. Con un banco que
 * ponga las columnas en otro orden, eso mete importes en el concepto y fechas
 * inventadas en la contabilidad, sin que nadie lo vea hasta mucho después.
 */
export function previewBankCsvContent(
  content: string,
  opts?: { delimiter?: ';' | ',' | 'auto' },
): BankCsvPreview {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const vacio: BankCsvPreview = {
    ok: false,
    delimiter: ';',
    cabeceras: [],
    detectado: { date: -1, amount: -1, description: -1, reference: -1 },
    reconocido: false,
    muestra: [],
    totalFilas: 0,
  }
  if (lines.length < 1) return { ...vacio, error: 'El archivo está vacío.' }

  let delimiter: ';' | ',' = ';'
  if (opts?.delimiter && opts.delimiter !== 'auto') delimiter = opts.delimiter
  else {
    const first = lines[0]
    delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ','
  }

  const cabeceras = splitRow(lines[0], delimiter)
  const detectado = {
    date: findCol(cabeceras, DATE_KEYS),
    amount: findCol(cabeceras, AMOUNT_KEYS),
    description: findCol(cabeceras, DESC_KEYS),
    reference: findCol(cabeceras, REF_KEYS),
  }
  const reconocido = detectado.date >= 0 && detectado.amount >= 0 && detectado.description >= 0
  // Si no se reconocen las cabeceras, la primera fila puede ser ya un dato.
  const desde = reconocido ? 1 : 0
  return {
    ok: true,
    delimiter,
    cabeceras,
    detectado: reconocido
      ? detectado
      : { date: 0, amount: cabeceras.length >= 3 ? 2 : 1, description: 1, reference: -1 },
    reconocido,
    muestra: lines.slice(desde, desde + 4).map((l) => splitRow(l, delimiter)),
    totalFilas: Math.max(0, lines.length - desde),
  }
}

export function parseBankCsvContent(
  content: string,
  opts?: { delimiter?: ';' | ',' | 'auto'; columnas?: BankCsvColumnas; saltarCabecera?: boolean },
): BankCsvParseResult {
  const warnings: string[] = []
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], warnings: ['El archivo no tiene filas de datos.'] }
  }

  let delimiter: ';' | ',' = ';'
  if (opts?.delimiter && opts.delimiter !== 'auto') {
    delimiter = opts.delimiter
  } else {
    const first = lines[0]
    const semi = (first.match(/;/g) || []).length
    const comma = (first.match(/,/g) || []).length
    delimiter = semi >= comma ? ';' : ','
  }

  const headerCells = splitRow(lines[0], delimiter)
  let dateIdx = findCol(headerCells, DATE_KEYS)
  let amountIdx = findCol(headerCells, AMOUNT_KEYS)
  let descIdx = findCol(headerCells, DESC_KEYS)
  let refIdx = findCol(headerCells, REF_KEYS)

  let dataStart = 1

  // Si el usuario ha dicho explícitamente qué columna es cuál en la
  // previsualización, manda él: su banco lo sabe mejor que estas heurísticas.
  if (opts?.columnas) {
    dateIdx = opts.columnas.date
    amountIdx = opts.columnas.amount
    descIdx = opts.columnas.description
    refIdx = opts.columnas.reference
    dataStart = opts.saltarCabecera === false ? 0 : 1
    const rows = leerFilas(lines, dataStart, delimiter, dateIdx, amountIdx, descIdx, refIdx, warnings)
    if (rows.length === 0) warnings.push('No se importó ninguna fila válida.')
    return { rows, warnings }
  }
  if (dateIdx < 0 || amountIdx < 0 || descIdx < 0) {
    warnings.push(
      'Cabeceras no reconocidas; usando columnas Fecha=0, Concepto=1, Importe=2 si hay al menos 3 columnas.',
    )
    dateIdx = 0
    descIdx = 1
    amountIdx = 2
    refIdx = -1
    dataStart = lines[0].split(delimiter).length >= 3 ? 0 : 1
    if (dataStart === 1 && lines.length < 2) return { rows: [], warnings }
  }

  const rows = leerFilas(lines, dataStart, delimiter, dateIdx, amountIdx, descIdx, refIdx, warnings)
  if (rows.length === 0) warnings.push('No se importó ninguna fila válida.')
  return { rows, warnings }
}

function leerFilas(
  lines: string[],
  dataStart: number,
  delimiter: ';' | ',',
  dateIdx: number,
  amountIdx: number,
  descIdx: number,
  refIdx: number,
  warnings: string[],
): BankCsvParseResult['rows'] {
  const rows: BankCsvParseResult['rows'] = []
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter)
    if (cells.length < Math.max(dateIdx, amountIdx, descIdx) + 1) continue

    const date = parseDateCell(cells[dateIdx] || '')
    const signedAmount = parseAmountCell(cells[amountIdx] || '')
    const description = (cells[descIdx] || '').replace(/^"|"$/g, '').trim() || '(sin concepto)'
    const reference =
      refIdx >= 0 && cells[refIdx] ? cells[refIdx].replace(/^"|"$/g, '').trim() || null : null

    if (!date || signedAmount === null) {
      warnings.push(`Fila ${i + 1}: fecha o importe no válidos, omitida.`)
      continue
    }

    rows.push({ date, signedAmount, description, reference, raw: cells })
  }
  return rows
}
