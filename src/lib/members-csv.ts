/** Parsea CSV de socios (delimitador ; o ,, cabeceras ES/EN). */

export type MemberCsvRow = {
  rowNumber: number
  name: string
  email?: string
  phone?: string
  dni?: string
  birthDate?: Date
  address?: string
  sportPreference?: string
  guardianName?: string
  guardianPhone?: string
  joinedAt?: Date
  status?: string
}

export type MemberCsvParseResult = {
  rows: MemberCsvRow[]
  errors: { row: number; message: string }[]
  headers: string[]
}

const HEADER_ALIASES: Record<string, keyof Omit<MemberCsvRow, 'rowNumber'>> = {
  nombre: 'name',
  name: 'name',
  apellidos: 'name',
  apellido: 'name',
  lastname: 'name',
  last_name: 'name',
  firstname: 'name',
  first_name: 'name',
  email: 'email',
  correo: 'email',
  correo_electronico: 'email',
  mail: 'email',
  telefono: 'phone',
  teléfono: 'phone',
  phone: 'phone',
  movil: 'phone',
  móvil: 'phone',
  dni: 'dni',
  nif: 'dni',
  documento: 'dni',
  fecha_nacimiento: 'birthDate',
  fechanacimiento: 'birthDate',
  birthdate: 'birthDate',
  birth_date: 'birthDate',
  nacimiento: 'birthDate',
  domicilio: 'address',
  address: 'address',
  direccion: 'address',
  dirección: 'address',
  deporte: 'sportPreference',
  sport: 'sportPreference',
  sportpreference: 'sportPreference',
  deporte_inscripcion: 'sportPreference',
  fecha_alta: 'joinedAt',
  fechaalta: 'joinedAt',
  joinedat: 'joinedAt',
  joined_at: 'joinedAt',
  alta: 'joinedAt',
  estado: 'status',
  status: 'status',
  tutor: 'guardianName',
  tutor_legal: 'guardianName',
  guardian: 'guardianName',
  guardianname: 'guardianName',
  telefono_tutor: 'guardianPhone',
  tutor_telefono: 'guardianPhone',
  guardianphone: 'guardianPhone',
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
    .replace(/\s+/g, '_')
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length
  const semis = (headerLine.match(/;/g) || []).length
  return semis > commas ? ';' : ','
}

function parseDateCell(raw: string): Date | undefined {
  const s = raw.trim().replace(/^"|"$/g, '')
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10))
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const year = parseInt(m[3], 10)
    const d = new Date(year, month, day)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parseStatus(raw: string): string | undefined {
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (['activo', 'active', 'alta'].includes(s)) return 'ACTIVE'
  if (['inactivo', 'inactive', 'baja'].includes(s)) return 'INACTIVE'
  if (['pausa', 'paused', 'en_pausa'].includes(s)) return 'PAUSED'
  if (['pendiente', 'pending', 'pending_payment', 'alta_pendiente'].includes(s)) return 'PENDING_PAYMENT'
  if (['lead'].includes(s)) return 'LEAD'
  if (['ACTIVE', 'INACTIVE', 'PAUSED', 'PENDING_PAYMENT', 'LEAD'].includes(raw.trim())) return raw.trim()
  return undefined
}

export function memberCsvTemplate(): string {
  return [
    'nombre,apellidos,email,telefono,dni,fecha_nacimiento,domicilio,deporte,fecha_alta,estado',
    'Ana,García López,ana@ejemplo.com,600111222,12345678A,2005-03-15,C/ Mayor 1,Masculino,2026-01-10,activo',
    'Pedro,Ruiz,,611222333,,,,,2026-02-01,activo',
  ].join('\n')
}

export function parseMembersCsvContent(content: string): MemberCsvParseResult {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const errors: { row: number; message: string }[] = []
  if (lines.length < 2) {
    return { rows: [], errors: [{ row: 1, message: 'El CSV debe incluir cabecera y al menos una fila de datos.' }], headers: [] }
  }

  const delimiter = detectDelimiter(lines[0])
  const headerCells = splitRow(lines[0], delimiter)
  const headers = headerCells.map((h) => normalizeHeader(h))

  const columnMap: { index: number; field: keyof Omit<MemberCsvRow, 'rowNumber'> }[] = []
  headers.forEach((h, index) => {
    const field = HEADER_ALIASES[h]
    if (field) columnMap.push({ index, field })
  })

  if (!columnMap.some((c) => c.field === 'name')) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'Falta columna de nombre (nombre, name o nombre+apellidos).' }],
      headers: headerCells,
    }
  }

  const rows: MemberCsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter)
    const rowNumber = i + 1
    const partial: Partial<MemberCsvRow> = { rowNumber }

    let firstName = ''
    let lastName = ''
    let fullName = ''

    for (const { index, field } of columnMap) {
      const raw = String(cells[index] ?? '').trim().replace(/^"|"$/g, '')
      if (!raw) continue

      if (field === 'name') {
        const h = headers[index]
        if (h === 'apellidos' || h === 'apellido' || h === 'lastname' || h === 'last_name') {
          lastName = raw
        } else if (h === 'name') {
          fullName = raw
        } else {
          firstName = raw
        }
        continue
      }

      if (field === 'birthDate' || field === 'joinedAt') {
        const d = parseDateCell(raw)
        if (!d) {
          errors.push({ row: rowNumber, message: `Fecha inválida en fila ${rowNumber}.` })
        } else {
          partial[field] = d
        }
        continue
      }

      if (field === 'status') {
        const st = parseStatus(raw)
        if (st) partial.status = st
        continue
      }

      ;(partial as Record<string, string>)[field] = raw
    }

    const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim()
    if (!name) {
      errors.push({ row: rowNumber, message: 'Nombre obligatorio.' })
      continue
    }

    rows.push({
      rowNumber,
      name,
      email: partial.email?.trim().toLowerCase() || undefined,
      phone: partial.phone,
      dni: partial.dni,
      birthDate: partial.birthDate,
      address: partial.address,
      sportPreference: partial.sportPreference,
      guardianName: partial.guardianName,
      guardianPhone: partial.guardianPhone,
      joinedAt: partial.joinedAt,
      status: partial.status || 'ACTIVE',
    })
  }

  return { rows, errors, headers: headerCells }
}
