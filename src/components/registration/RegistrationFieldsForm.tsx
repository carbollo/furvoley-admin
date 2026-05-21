'use client'

import type { RegistrationFieldDef, RegistrationFieldValues } from '@/lib/registration-fields'

type Variant = 'join' | 'crm'

export function RegistrationFieldsForm({
  fields,
  values,
  onChange,
  variant = 'join',
  disabled = false,
}: {
  fields: RegistrationFieldDef[]
  values?: RegistrationFieldValues
  onChange?: (key: string, value: string) => void
  variant?: Variant
  disabled?: boolean
}) {
  const enabled = fields.filter((f) => f.enabled).sort((a, b) => a.order - b.order)
  const isCrm = variant === 'crm'

  const joinLabelCls = 'block text-[13px] font-semibold tracking-wide text-[#64748b] mb-2'
  const crmLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 6,
  }

  const crmInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f8fafc',
  }

  const joinInputCls =
    'w-full rounded-xl border px-4 py-3 text-[15px] text-[#111827] placeholder:text-neutral-400 outline-none transition-[box-shadow,border-color] focus:ring-2 focus:ring-[oklch(0.62_0.14_240_/_0.35)] bg-white'

  const borderInput = '1px solid rgba(0, 0, 0, 0.1)'

  function renderField(field: RegistrationFieldDef) {
    const value = values?.[field.key] ?? ''
    const labelText = `${field.label}${field.required ? ' *' : ''}`
    const controlled = Boolean(onChange)
    const changeHandler = onChange
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(field.key, e.target.value)
      : undefined
    const inputProps = controlled
      ? { value, onChange: changeHandler }
      : { defaultValue: value, onChange: changeHandler }

    const span2 =
      isCrm &&
      ['firstName', 'lastName', 'phone', 'email', 'address', 'sportPreference'].includes(field.key)

    const wrapStyle: React.CSSProperties | undefined = isCrm
      ? span2
        ? { gridColumn: 'span 2' }
        : undefined
      : undefined

    if (field.type === 'textarea') {
      return (
        <div key={field.id} style={isCrm ? { gridColumn: 'span 2' } : wrapStyle}>
          {isCrm ? (
            <label style={crmLabelStyle}>{labelText}</label>
          ) : (
            <label className={joinLabelCls}>{labelText}</label>
          )}
          <textarea
            name={field.key}
            required={field.required}
            disabled={disabled}
            {...inputProps}
            rows={3}
            className={isCrm ? undefined : joinInputCls}
            style={isCrm ? crmInputStyle : { border: borderInput }}
          />
        </div>
      )
    }

    const inputType =
      field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'

    return (
      <div key={field.id} style={wrapStyle}>
        {isCrm ? (
          <label style={crmLabelStyle}>{labelText}</label>
        ) : (
          <label className={joinLabelCls}>{labelText}</label>
        )}
        <input
          name={field.key}
          required={field.required}
          disabled={disabled}
          {...inputProps}
          type={inputType}
          className={isCrm ? undefined : joinInputCls}
          style={isCrm ? crmInputStyle : { border: borderInput }}
          autoComplete={autoCompleteFor(field.key)}
        />
      </div>
    )
  }

  if (isCrm) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {enabled.map(renderField)}
      </div>
    )
  }

  return <div className="space-y-5">{enabled.map(renderField)}</div>
}

function autoCompleteFor(key: string): string | undefined {
  if (key === 'firstName') return 'given-name'
  if (key === 'lastName') return 'family-name'
  if (key === 'email') return 'email'
  if (key === 'phone' || key === 'guardianPhone') return 'tel'
  if (key === 'address') return 'street-address'
  return undefined
}
