'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type MemberOption = {
  id: string
  nombre: string
  email?: string
  avatar?: string
  estado?: string
}

type MemberComboboxProps = {
  value: string
  onChange: (memberId: string, member?: MemberOption | null) => void
  label?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  excludeIds?: string[]
  /** Etiqueta mostrada cuando value está fijado pero no hay opción cargada */
  displayLabel?: string
  style?: React.CSSProperties
}

export function MemberCombobox({
  value,
  onChange,
  label,
  placeholder = 'Buscar socio por nombre o email…',
  required = false,
  disabled = false,
  excludeIds = [],
  displayLabel,
  style,
}: MemberComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [options, setOptions] = useState<MemberOption[]>([])
  const [selected, setSelected] = useState<MemberOption | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const excludeSet = new Set(excludeIds)

  const loadOptions = useCallback(
    async (q: string) => {
      setBusy(true)
      try {
        const params = new URLSearchParams({
          lite: '1',
          page: '1',
          pageSize: '25',
        })
        if (q.trim()) params.set('q', q.trim())
        const r = await fetch(`/api/crm/members?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!r.ok) {
          setOptions([])
          return
        }
        const j = await r.json()
        const rows = (Array.isArray(j?.socios) ? j.socios : []) as MemberOption[]
        setOptions(rows.filter((row) => !excludeSet.has(row.id)))
      } finally {
        setBusy(false)
      }
    },
    [excludeIds.join('|')],
  )

  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    if (selected?.id === value) return
    if (displayLabel) {
      setSelected({ id: value, nombre: displayLabel })
      return
    }
    let cancelled = false
    ;(async () => {
      const r = await fetch(`/api/crm/members?id=${encodeURIComponent(value)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!r.ok || cancelled) return
      const j = await r.json()
      if (j?.socio?.id) setSelected(j.socio)
    })()
    return () => {
      cancelled = true
    }
  }, [value, displayLabel, selected?.id])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadOptions(query).catch(() => {})
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, query, loadOptions])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const inputValue = open ? query : selected?.nombre || displayLabel || ''

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      {label ? (
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#78716c',
            marginBottom: 6,
            display: 'block',
          }}
        >
          {label}
        </label>
      ) : null}
      <input
        type="text"
        required={required && !value}
        disabled={disabled}
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => {
          if (disabled) return
          setOpen(true)
          if (!query && !options.length) loadOptions('').catch(() => {})
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) {
            onChange('', null)
            setSelected(null)
          }
        }}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.09)',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      {value && !disabled ? (
        <button
          type="button"
          onClick={() => {
            onChange('', null)
            setSelected(null)
            setQuery('')
          }}
          style={{
            position: 'absolute',
            right: 8,
            top: label ? 30 : 8,
            border: 'none',
            background: 'transparent',
            color: '#a8a29e',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Quitar selección"
        >
          ×
        </button>
      ) : null}
      {open && !disabled ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 600,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.09)',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(15,23,42,0.12)',
          }}
        >
          {busy ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#78716c' }}>Buscando…</div>
          ) : options.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#78716c' }}>
              {query.trim() ? 'Sin resultados' : 'Escribe para buscar socios'}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSelected(opt)
                  onChange(opt.id, opt)
                  setQuery('')
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  border: 'none',
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                  background: value === opt.id ? 'var(--accent-soft, #eff6ff)' : '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>{opt.nombre}</div>
                {opt.email ? (
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>{opt.email}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
