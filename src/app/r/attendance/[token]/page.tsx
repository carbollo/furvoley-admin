'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type AttRow = { id: string; memberName: string; status: string }

export default function AttendanceResponsePage() {
  const params = useParams()
  const token = String(params.token || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<AttRow[]>([])
  const [reasonMode, setReasonMode] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/public/workflow-response/${token}`)
        const j = await r.json()
        if (!r.ok) {
          setError(j.error || 'Enlace no válido')
          return
        }
        setTitle(j.event?.title || 'Pase de lista')
        setRows(j.attendances || [])
        setReasonMode(j.type === 'ATTENDANCE_REASON')
      } catch {
        setError('Error al cargar')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  async function setStatus(attendanceId: string, status: string, reasonText?: string) {
    const r = await fetch(`/api/public/workflow-response/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceId, status, reason: reasonText }),
    })
    if (r.ok) {
      setRows((prev) =>
        prev.map((x) => (x.id === attendanceId ? { ...x, status } : x)),
      )
    }
  }

  async function submitReason() {
    if (!selectedId || !reason.trim()) return
    await setStatus(selectedId, 'ABSENT', reason.trim())
    setDone(true)
  }

  if (loading) return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Cargando…</main>
  if (error) return <main style={{ padding: 24, fontFamily: 'system-ui', color: '#b91c1c' }}>{error}</main>
  if (done) return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Gracias, motivo registrado.</main>

  if (reasonMode) {
    return (
      <main style={{ maxWidth: 480, margin: '40px auto', padding: 24, fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Motivo de ausencia</h1>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12 }}
        >
          <option value="">— Jugador —</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.memberName}
            </option>
          ))}
        </select>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (enfermedad, lesión, colegio…)"
          style={{ width: '100%', minHeight: 80, padding: 10, marginBottom: 12 }}
        />
        <button
          type="button"
          onClick={() => void submitReason()}
          style={{ padding: '10px 16px', background: '#004ac6', color: '#fff', border: 'none', borderRadius: 8 }}
        >
          Enviar
        </button>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 520, margin: '40px auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Marca asistencia con un toque.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '1px solid #e2e8f0',
              borderRadius: 10,
            }}
          >
            <span>{r.memberName}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['PRESENT', 'LATE', 'ABSENT'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void setStatus(r.id, s)}
                  style={{
                    padding: '6px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: r.status === s ? '#dbeafe' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {s === 'PRESENT' ? '✓' : s === 'LATE' ? 'T' : '✗'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
