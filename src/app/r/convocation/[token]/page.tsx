'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function ConvocationResponsePage() {
  const params = useParams()
  const token = String(params.token || '')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function answer(value: 'yes' | 'no') {
    const r = await fetch(`/api/public/workflow-response/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: value }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      setError(j.error || 'No se pudo registrar')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <main style={{ maxWidth: 400, margin: '60px auto', padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
        <h1>Respuesta registrada</h1>
        <p>Gracias.</p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 400, margin: '60px auto', padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
      <h1 style={{ marginBottom: 12 }}>Convocatoria</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>¿Puede asistir al partido/evento?</p>
      {error && <p style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => void answer('yes')}
          style={{ padding: '12px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8 }}
        >
          Confirmo
        </button>
        <button
          type="button"
          onClick={() => void answer('no')}
          style={{ padding: '12px 24px', background: '#64748b', color: '#fff', border: 'none', borderRadius: 8 }}
        >
          No puede
        </button>
      </div>
    </main>
  )
}
