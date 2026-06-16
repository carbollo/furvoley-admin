'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function TrialResponsePage() {
  const params = useParams()
  const token = String(params.token || '')
  const [done, setDone] = useState(false)

  async function confirm(attending: boolean) {
    await fetch(`/api/public/workflow-response/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attending }),
    })
    setDone(true)
  }

  if (done) {
    return (
      <main style={{ maxWidth: 400, margin: '60px auto', padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
        <h1>Gracias</h1>
        <p>Confirmación de prueba registrada.</p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 400, margin: '60px auto', padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
      <h1>Prueba de entrenamiento</h1>
      <p style={{ color: '#78716c', margin: '16px 0 24px' }}>¿Asistirás a la prueba?</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button type="button" onClick={() => void confirm(true)} style={{ padding: '12px 20px', background: '#004ac6', color: '#fff', border: 'none', borderRadius: 8 }}>Confirmo</button>
        <button type="button" onClick={() => void confirm(false)} style={{ padding: '12px 20px', background: '#a8a29e', color: '#fff', border: 'none', borderRadius: 8 }}>No puedo</button>
      </div>
    </main>
  )
}
