'use client'

import {
  getDefaultRegistrationFields,
  slugifyCustomFieldKey,
  type RegistrationFieldDef,
  type RegistrationFieldType,
} from '@/lib/registration-fields'

const FIELD_TYPES: { value: RegistrationFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'date', label: 'Fecha' },
  { value: 'textarea', label: 'Texto largo' },
]

function newCustomField(existing: RegistrationFieldDef[]): RegistrationFieldDef {
  const label = 'Campo personalizado'
  let key = slugifyCustomFieldKey(label)
  const used = new Set(existing.map((f) => f.key))
  let n = 2
  while (used.has(key)) {
    key = `${slugifyCustomFieldKey(label)}_${n}`
    n++
  }
  return {
    id: `custom_${Date.now().toString(36)}`,
    kind: 'custom',
    key,
    label,
    type: 'text',
    enabled: true,
    required: false,
    order: 100 + existing.filter((f) => f.kind === 'custom').length,
  }
}

export function RegistrationFieldsTab({
  fields,
  onChange,
}: {
  fields: RegistrationFieldDef[]
  onChange: (fields: RegistrationFieldDef[]) => void
}) {
  const builtins = fields.filter((f) => f.kind === 'builtin')
  const customs = fields.filter((f) => f.kind === 'custom')

  function patchField(id: string, patch: Partial<RegistrationFieldDef>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeCustom(id: string) {
    onChange(fields.filter((f) => f.id !== id))
  }

  function addCustom() {
    onChange([...fields, newCustomField(fields)])
  }

  function resetDefaults() {
    onChange(getDefaultRegistrationFields())
  }

  return (
    <div>
      <Section
        title="Campos de inscripción"
        subtitle="Estos campos aparecen en el enlace público de alta y en la inscripción manual del CRM. Plan de cuota y fecha de alta siguen siendo solo del CRM."
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            onClick={resetDefaults}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-card)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Restaurar valores predeterminados
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {builtins.map((field) => (
            <div
              key={field.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-card)',
              }}
            >
              <div>
                <input
                  value={field.label}
                  onChange={(e) => patchField(field.id, { label: e.target.value })}
                  style={inputStyle}
                  placeholder="Etiqueta"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Campo del sistema · {field.key}
                </div>
              </div>
              <label style={toggleLabel}>
                <input
                  type="checkbox"
                  checked={field.enabled}
                  onChange={(e) => patchField(field.id, { enabled: e.target.checked, required: e.target.checked ? field.required : false })}
                />
                Visible
              </label>
              <label style={{ ...toggleLabel, opacity: field.enabled ? 1 : 0.45 }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={!field.enabled}
                  onChange={(e) => patchField(field.id, { required: e.target.checked })}
                />
                Obligatorio
              </label>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Campos personalizados"
        subtitle="Añade datos extra (talla, alergias, etc.). Estarán disponibles en flujos como {memberExtra_clave}."
      >
        {customs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            No hay campos personalizados todavía.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {customs.map((field) => (
              <div
                key={field.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr 0.8fr auto auto auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-card)',
                }}
              >
                <input
                  value={field.label}
                  onChange={(e) => {
                    const label = e.target.value
                    patchField(field.id, { label })
                  }}
                  style={inputStyle}
                  placeholder="Etiqueta"
                />
                <input
                  value={field.key}
                  onChange={(e) => patchField(field.id, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  style={inputStyle}
                  placeholder="clave_campo"
                />
                <select
                  value={field.type}
                  onChange={(e) => patchField(field.id, { type: e.target.value as RegistrationFieldType })}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label style={toggleLabel}>
                  <input
                    type="checkbox"
                    checked={field.enabled}
                    onChange={(e) => patchField(field.id, { enabled: e.target.checked })}
                  />
                  Visible
                </label>
                <label style={{ ...toggleLabel, opacity: field.enabled ? 1 : 0.45 }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={!field.enabled}
                    onChange={(e) => patchField(field.id, { required: e.target.checked })}
                  />
                  Oblig.
                </label>
                <button
                  type="button"
                  onClick={() => removeCustom(field.id)}
                  style={{
                    padding: '6px 10px',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid rgba(185,28,28,0.25)',
                    background: 'rgba(185,28,28,0.08)',
                    color: '#b91c1c',
                    cursor: 'pointer',
                  }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addCustom}
          style={{
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          + Añadir campo personalizado
        </button>
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {subtitle ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</p>
      ) : null}
      {children}
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
}

const toggleLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}
