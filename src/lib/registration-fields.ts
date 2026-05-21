import { randomBytes } from 'crypto'

export type RegistrationFieldType = 'text' | 'email' | 'tel' | 'date' | 'textarea'

export type RegistrationFieldDef = {
  id: string
  kind: 'builtin' | 'custom'
  key: string
  label: string
  type: RegistrationFieldType
  enabled: boolean
  required: boolean
  order: number
}

export type RegistrationFieldValues = Record<string, string>

export type RegistrationMemberData = {
  name: string
  dni?: string | null
  birthDate?: Date | null
  phone?: string | null
  email?: string | null
  address?: string | null
  guardianName?: string | null
  guardianPhone?: string | null
  sportPreference?: string | null
  registrationExtra?: Record<string, string> | null
}

export const BUILTIN_REGISTRATION_KEYS = [
  'firstName',
  'lastName',
  'dni',
  'birthDate',
  'phone',
  'email',
  'address',
  'sportPreference',
  'guardianName',
  'guardianPhone',
] as const

export type BuiltinRegistrationKey = (typeof BUILTIN_REGISTRATION_KEYS)[number]

const BUILTIN_KEY_SET = new Set<string>(BUILTIN_REGISTRATION_KEYS)

const BUILTIN_DEFAULTS: Omit<RegistrationFieldDef, 'id'>[] = [
  { kind: 'builtin', key: 'firstName', label: 'Nombre', type: 'text', enabled: true, required: true, order: 0 },
  { kind: 'builtin', key: 'lastName', label: 'Apellidos', type: 'text', enabled: true, required: true, order: 1 },
  { kind: 'builtin', key: 'birthDate', label: 'Fecha de nacimiento', type: 'date', enabled: true, required: true, order: 2 },
  { kind: 'builtin', key: 'dni', label: 'DNI', type: 'text', enabled: true, required: true, order: 3 },
  { kind: 'builtin', key: 'phone', label: 'Teléfono', type: 'tel', enabled: true, required: true, order: 4 },
  { kind: 'builtin', key: 'email', label: 'Correo electrónico', type: 'email', enabled: true, required: false, order: 5 },
  { kind: 'builtin', key: 'address', label: 'Domicilio', type: 'text', enabled: true, required: false, order: 6 },
  { kind: 'builtin', key: 'sportPreference', label: 'Deporte a inscribirse', type: 'text', enabled: true, required: false, order: 7 },
  { kind: 'builtin', key: 'guardianName', label: 'Nombre del tutor legal', type: 'text', enabled: false, required: false, order: 8 },
  { kind: 'builtin', key: 'guardianPhone', label: 'Teléfono del tutor legal', type: 'tel', enabled: false, required: false, order: 9 },
]

export const MAX_CUSTOM_REGISTRATION_FIELDS = 20
export const MAX_REGISTRATION_FIELD_VALUE_LEN = 500

const CUSTOM_KEY_RE = /^[a-z0-9_]{2,40}$/

function clampFieldValue(value: string): string {
  return value.length > MAX_REGISTRATION_FIELD_VALUE_LEN
    ? value.slice(0, MAX_REGISTRATION_FIELD_VALUE_LEN)
    : value
}

function stableId(prefix: string, key: string) {
  return `${prefix}_${key}`
}

function newCustomId() {
  return `custom_${randomBytes(6).toString('hex')}`
}

export function slugifyCustomFieldKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base.length >= 2 ? base : `campo_${randomBytes(3).toString('hex')}`
}

export function getDefaultRegistrationFields(): RegistrationFieldDef[] {
  return BUILTIN_DEFAULTS.map((f) => ({
    ...f,
    id: stableId('builtin', f.key),
  }))
}

function isFieldType(v: unknown): v is RegistrationFieldType {
  return v === 'text' || v === 'email' || v === 'tel' || v === 'date' || v === 'textarea'
}

function parseFieldDef(raw: unknown, fallback: RegistrationFieldDef): RegistrationFieldDef | null {
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as Record<string, unknown>
  const key = String(o.key ?? fallback.key).trim()
  if (!key) return null

  const kind = o.kind === 'custom' ? 'custom' : 'builtin'
  if (kind === 'builtin' && !BUILTIN_KEY_SET.has(key)) return null
  if (kind === 'custom' && !CUSTOM_KEY_RE.test(key)) return null
  if (kind === 'custom' && BUILTIN_KEY_SET.has(key)) return null

  const label = String(o.label ?? fallback.label).trim() || fallback.label
  const type = isFieldType(o.type) ? o.type : fallback.type

  return {
    id: String(o.id ?? fallback.id).trim() || fallback.id,
    kind,
    key,
    label,
    type,
    enabled: o.enabled === false ? false : Boolean(o.enabled ?? fallback.enabled),
    required: Boolean(o.required ?? fallback.required),
    order: Number.isFinite(Number(o.order)) ? Number(o.order) : fallback.order,
  }
}

export function normalizeRegistrationFieldsConfig(
  raw: unknown,
): RegistrationFieldDef[] {
  const defaults = getDefaultRegistrationFields()
  const defaultByKey = new Map(defaults.map((f) => [f.key, f]))
  const mergedBuiltin = new Map<string, RegistrationFieldDef>()

  for (const def of defaults) {
    mergedBuiltin.set(def.key, { ...def })
  }

  const custom: RegistrationFieldDef[] = []
  const customKeys = new Set<string>()

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const kind = (item as Record<string, unknown>).kind === 'custom' ? 'custom' : 'builtin'
      const key = String((item as Record<string, unknown>).key ?? '').trim()
      if (!key) continue

      if (kind === 'builtin') {
        const fallback = defaultByKey.get(key)
        if (!fallback) continue
        const parsed = parseFieldDef(item, fallback)
        if (parsed) mergedBuiltin.set(key, parsed)
      } else {
        if (customKeys.has(key) || BUILTIN_KEY_SET.has(key)) continue
        if (custom.length >= MAX_CUSTOM_REGISTRATION_FIELDS) continue
        const fallback: RegistrationFieldDef = {
          id: newCustomId(),
          kind: 'custom',
          key,
          label: key,
          type: 'text',
          enabled: true,
          required: false,
          order: 100 + custom.length,
        }
        const parsed = parseFieldDef(item, fallback)
        if (parsed) {
          custom.push(parsed)
          customKeys.add(key)
        }
      }
    }
  }

  const builtins = [...mergedBuiltin.values()].sort((a, b) => a.order - b.order)
  const customs = custom.sort((a, b) => a.order - b.order)
  return [...builtins, ...customs]
}

export function validateRegistrationFieldsConfig(
  fields: RegistrationFieldDef[],
): string | null {
  const enabledName =
    (fields.find((f) => f.key === 'firstName' && f.enabled)?.enabled ?? false) ||
    (fields.find((f) => f.key === 'lastName' && f.enabled)?.enabled ?? false)
  if (!enabledName) {
    return 'Debe haber al menos Nombre o Apellidos visible en el formulario de registro'
  }

  const keys = new Set<string>()
  let customCount = 0
  for (const f of fields) {
    if (keys.has(f.key)) return `Clave duplicada: ${f.key}`
    keys.add(f.key)
    if (f.kind === 'custom') {
      customCount++
      if (!CUSTOM_KEY_RE.test(f.key)) {
        return `Clave de campo personalizado inválida: ${f.key}`
      }
    }
  }
  if (customCount > MAX_CUSTOM_REGISTRATION_FIELDS) {
    return `Máximo ${MAX_CUSTOM_REGISTRATION_FIELDS} campos personalizados`
  }
  return null
}

export function getEnabledRegistrationFields(
  config: RegistrationFieldDef[],
): RegistrationFieldDef[] {
  return config.filter((f) => f.enabled).sort((a, b) => a.order - b.order)
}

export function emptyRegistrationValues(config: RegistrationFieldDef[]): RegistrationFieldValues {
  const values: RegistrationFieldValues = {}
  for (const f of getEnabledRegistrationFields(config)) {
    values[f.key] = ''
  }
  return values
}

export function validateRegistrationSubmission(
  values: RegistrationFieldValues,
  config: RegistrationFieldDef[],
): Record<string, string> {
  const errors: Record<string, string> = {}
  const enabled = getEnabledRegistrationFields(config)

  for (const field of enabled) {
    const raw = values[field.key]
    const trimmed = typeof raw === 'string' ? raw.trim() : ''

    if (field.required && !trimmed) {
      errors[field.key] = `${field.label} es obligatorio`
      continue
    }
    if (!trimmed) continue

    if (field.type === 'email' && !trimmed.includes('@')) {
      errors[field.key] = 'Email no válido'
    }
    if (field.type === 'date') {
      const d = new Date(trimmed)
      if (Number.isNaN(d.getTime())) {
        errors[field.key] = 'Fecha no válida'
      }
    }
  }

  const first = enabled.find((f) => f.key === 'firstName')
  const last = enabled.find((f) => f.key === 'lastName')
  const firstVal = first?.enabled ? String(values.firstName ?? '').trim() : ''
  const lastVal = last?.enabled ? String(values.lastName ?? '').trim() : ''
  if ((first?.enabled || last?.enabled) && !firstVal && !lastVal) {
    errors.firstName = 'Indica nombre y/o apellidos'
  }

  return errors
}

export function mapRegistrationToMemberData(
  values: RegistrationFieldValues,
  config: RegistrationFieldDef[],
): RegistrationMemberData {
  const enabled = getEnabledRegistrationFields(config)
  const enabledKeys = new Set(enabled.map((f) => f.key))

  const firstName = enabledKeys.has('firstName') ? String(values.firstName ?? '').trim() : ''
  const lastName = enabledKeys.has('lastName') ? String(values.lastName ?? '').trim() : ''
  const name = [firstName, lastName].filter(Boolean).join(' ').trim()

  let birthDate: Date | null = null
  if (enabledKeys.has('birthDate')) {
    const raw = String(values.birthDate ?? '').trim()
    if (raw) {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) birthDate = d
    }
  }

  const pick = (key: string) => {
    if (!enabledKeys.has(key)) return null
    const v = clampFieldValue(String(values[key] ?? '').trim())
    return v || null
  }

  const registrationExtra: Record<string, string> = {}
  for (const field of enabled) {
    if (field.kind !== 'custom') continue
    const v = clampFieldValue(String(values[field.key] ?? '').trim())
    if (v) registrationExtra[field.key] = v
  }

  return {
    name: clampFieldValue(name),
    dni: pick('dni'),
    birthDate,
    phone: pick('phone'),
    email: pick('email'),
    address: pick('address'),
    guardianName: pick('guardianName'),
    guardianPhone: pick('guardianPhone'),
    sportPreference: pick('sportPreference'),
    registrationExtra: Object.keys(registrationExtra).length ? registrationExtra : null,
  }
}

export function registrationValuesFromFormData(
  formData: FormData,
  config: RegistrationFieldDef[],
): RegistrationFieldValues {
  const values: RegistrationFieldValues = {}
  for (const field of getEnabledRegistrationFields(config)) {
    values[field.key] = String(formData.get(field.key) ?? '').trim()
  }
  return values
}

export function memberExtraWorkflowToken(key: string): string {
  return `memberExtra_${key}`
}

export function triggerMemberExtraWorkflowToken(key: string): string {
  return `triggerMemberExtra_${key}`
}

export function buildMemberExtraVariables(
  extra: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!extra || typeof extra !== 'object') return out
  for (const [key, value] of Object.entries(extra)) {
    const v = String(value ?? '')
    out[memberExtraWorkflowToken(key)] = v
    out[triggerMemberExtraWorkflowToken(key)] = v
  }
  return out
}

export function branchFieldOptionsFromConfig(
  config: RegistrationFieldDef[],
): Array<{ value: string; label: string }> {
  const base = [
    { value: 'member.age', label: 'Edad' },
    { value: 'member.status', label: 'Estado' },
    { value: 'member.hasBirthDate', label: 'Tiene fecha nac.' },
    { value: 'member.name', label: 'Nombre' },
    { value: 'member.email', label: 'Correo' },
    { value: 'member.phone', label: 'Teléfono' },
    { value: 'member.dni', label: 'DNI' },
    { value: 'member.address', label: 'Domicilio' },
    { value: 'member.sportPreference', label: 'Deporte inscripción' },
    { value: 'member.guardianName', label: 'Tutor legal (nombre)' },
    { value: 'member.guardianPhone', label: 'Tutor legal (teléfono)' },
  ]
  const custom = config
    .filter((f) => f.kind === 'custom')
    .map((f) => ({
      value: `member.extra.${f.key}`,
      label: f.label,
    }))
  return [...base, ...custom]
}

export function workflowTokensFromConfig(
  config: RegistrationFieldDef[],
): Array<{ token: string; label: string }> {
  const extra = config
    .filter((f) => f.kind === 'custom')
    .map((f) => ({
      token: `{${memberExtraWorkflowToken(f.key)}}`,
      label: `Socio · ${f.label}`,
    }))
  const triggerExtra = config
    .filter((f) => f.kind === 'custom')
    .map((f) => ({
      token: `{${triggerMemberExtraWorkflowToken(f.key)}}`,
      label: `Trigger · ${f.label}`,
    }))
  return [...extra, ...triggerExtra]
}
