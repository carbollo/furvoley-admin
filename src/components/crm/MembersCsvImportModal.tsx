'use client'

import { useCallback, useRef, useState } from 'react'

type Plan = {
  id: string
  name: string
  amount: number
  billingPeriodLabel?: string
  enrollmentFee?: number
  paymentRequiredOnEnrollment?: boolean
}

export function MembersCsvImportModal({
  open,
  onClose,
  membershipPlans,
  fmtMoney,
  onDone,
  showAlert,
}: {
  open: boolean
  onClose: () => void
  membershipPlans: Plan[]
  fmtMoney: (n: number) => string
  onDone: () => Promise<void>
  showAlert: (message: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [planId, setPlanId] = useState('')
  const [skipExisting, setSkipExisting] = useState(true)
  const [paymentRequiredOnEnrollment, setPaymentRequiredOnEnrollment] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    created: number
    skipped: number
    errors: { row: number; message: string }[]
    parseErrors: { row: number; message: string }[]
  } | null>(null)

  const reset = useCallback(() => {
    setCsvText('')
    setFileName('')
    setPlanId(membershipPlans[0]?.id || '')
    setSkipExisting(true)
    setPaymentRequiredOnEnrollment(
      membershipPlans[0]?.paymentRequiredOnEnrollment ?? false,
    )
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [membershipPlans])

  if (!open) return null

  async function onFileChange(file: File | null) {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const text = await file.text()
    setCsvText(text)
  }

  async function onImport() {
    if (!csvText.trim()) {
      showAlert('Selecciona un archivo CSV o pega su contenido.')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const r = await fetch('/api/crm/members/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvText,
          planId: planId || undefined,
          skipExisting,
          paymentRequiredOnEnrollment,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo importar el CSV')
        if (Array.isArray(j.errors)) setResult({ created: 0, skipped: 0, errors: j.errors, parseErrors: [] })
        return
      }
      setResult({
        created: Number(j.created || 0),
        skipped: Number(j.skipped || 0),
        errors: Array.isArray(j.errors) ? j.errors : [],
        parseErrors: Array.isArray(j.parseErrors) ? j.parseErrors : [],
      })
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  const label = { fontSize: 12, fontWeight: 600, color: '#a8a29e', marginBottom: 6, display: 'block' as const }
  const input = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid #44403c',
    background: '#292524',
    color: '#f4efe8',
    fontFamily: 'inherit',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(15,23,42,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 16,
          padding: 28,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#faf7f2' }}>
          Importar socios (CSV)
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#a8a29e', lineHeight: 1.5 }}>
          Sube un CSV con cabeceras. Columnas admitidas: nombre, apellidos, email, telefono, dni,
          fecha_nacimiento, domicilio, deporte, fecha_alta, estado.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <a
            href="/api/crm/members/import"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #44403c',
              color: '#93c5fd',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Descargar plantilla
          </a>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #44403c',
              background: '#292524',
              color: '#f4efe8',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Elegir archivo CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => void onFileChange(e.target.files?.[0] || null)}
          />
        </div>

        {fileName ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#d8cdbd' }}>Archivo: {fileName}</p>
        ) : null}

        <label style={label}>O pega el CSV aquí</label>
        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value)
            setResult(null)
          }}
          rows={6}
          disabled={busy}
          placeholder="nombre,apellidos,email,telefono..."
          style={{ ...input, resize: 'vertical', marginBottom: 16 }}
        />

        {membershipPlans.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Plan de cuota (opcional, mismo para todos)</label>
            <select
              value={planId}
              onChange={(e) => {
                const id = e.target.value
                setPlanId(id)
                const p = membershipPlans.find((x) => x.id === id)
                if (p) setPaymentRequiredOnEnrollment(p.paymentRequiredOnEnrollment ?? false)
              }}
              style={{ ...input, cursor: 'pointer' }}
              disabled={busy}
            >
              <option value="">Sin asignar cuota</option>
              {membershipPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmtMoney(p.amount)}
                  {p.billingPeriodLabel ? ` / ${p.billingPeriodLabel}` : ''}
                </option>
              ))}
            </select>
            {planId ? (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, fontSize: 13, color: '#d8cdbd', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={paymentRequiredOnEnrollment}
                  onChange={(e) => setPaymentRequiredOnEnrollment(e.target.checked)}
                  disabled={busy}
                />
                Exigir pago al alta (factura en Mis pagos)
              </label>
            ) : null}
          </div>
        ) : null}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, fontSize: 13, color: '#d8cdbd', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} disabled={busy} />
          Omitir filas cuyo email ya exista en el club
        </label>

        {result ? (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 10,
              background: '#1c1917',
              border: '1px solid #44403c',
              fontSize: 13,
              color: '#ebe3d8',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong>{result.created}</strong> creados · <strong>{result.skipped}</strong> omitidos
            </div>
            {[...result.parseErrors, ...result.errors].slice(0, 8).map((err, i) => (
              <div key={`${err.row}-${i}`} style={{ color: '#fca5a5', marginTop: 6 }}>
                Fila {err.row}: {err.message}
              </div>
            ))}
            {result.parseErrors.length + result.errors.length > 8 ? (
              <div style={{ color: '#a8a29e', marginTop: 6 }}>…y más avisos</div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              reset()
              onClose()
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #57534e',
              background: 'transparent',
              color: '#d8cdbd',
              fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onImport()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Importando…' : 'Importar socios'}
          </button>
        </div>
      </div>
    </div>
  )
}
