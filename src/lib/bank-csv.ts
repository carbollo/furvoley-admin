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

function parseDateCell(raw: string): Date | null {
  const s = raw.trim().replace(/^"|"$/g, '')
  if (!s) return null
  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10))
    return Number.isNaN(d.getTime()) ? null : d
  }
  // dd/MM/yyyy o dd-MM-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const year = parseInt(m[3], 10)
    const d = new Date(year, month, day)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t)
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

export function parseBankCsvContent(
  content: string,
  opts?: { delimiter?: ';' | ',' | 'auto' },
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

  if (rows.length === 0) warnings.push('No se importó ninguna fila válida.')
  return { rows, warnings }
}
