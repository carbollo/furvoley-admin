'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useParams } from 'next/navigation'

const REASONS = [
  { value: 'schedule', label: 'Horarios / compatibilidad' },
  { value: 'move', label: 'Cambio de ciudad' },
  { value: 'injury', label: 'Lesión o salud' },
  { value: 'economic', label: 'Motivos económicos' },
  { value: 'other_club', label: 'Cambio a otro club' },
  { value: 'other', label: 'Otro motivo' },
]

export default function LeaveSurveyPage() {
  const params = useParams()
  const token = String(params.token || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [used, setUsed] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
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
        if (j.used) {
          setUsed(true)
          return
        }
        if (j.prefill?.name) setName(String(j.prefill.name))
        if (j.prefill?.email) setEmail(String(j.prefill.email))
        if (j.prefill?.phone) setPhone(String(j.prefill.phone))
      } catch {
        setError('No se pudo cargar el formulario')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !reason) {
      setError('Indica tu nombre y el motivo principal.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const r = await fetch(`/api/public/workflow-response/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          reason,
          comments: comments.trim(),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo enviar')
        return
      }
      setDone(true)
    } catch {
      setError('Error de red al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  const shell: CSSProperties = {
    maxWidth: 480,
    margin: '48px auto',
    padding: 24,
    fontFamily: 'system-ui, sans-serif',
  }

  if (loading) return <main style={shell}>Cargando formulario…</main>
  if (error && !done) {
    return (
      <main style={shell}>
        <p style={{ color: '#b91c1c' }}>{error}</p>
      </main>
    )
  }
  if (used || done) {
    return (
      <main style={shell}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Gracias</h1>
        <p style={{ color: '#78716c', lineHeight: 1.5 }}>
          {used
            ? 'Este enlace ya se utilizó. Si necesitas contactar con el club, escríbenos directamente.'
            : 'Hemos recibido tus datos. Tu opinión nos ayuda a mejorar.'}
        </p>
      </main>
    )
  }

  return (
    <main style={shell}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Encuesta de baja</h1>
      <p style={{ color: '#78716c', marginBottom: 20, lineHeight: 1.45 }}>
        Cuéntanos el motivo de tu baja. No hace falta iniciar sesión.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Nombre y apellidos *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #d8cdbd' }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #d8cdbd' }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Teléfono
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #d8cdbd' }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Motivo principal *
          <select
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #d8cdbd' }}
          >
            <option value="">— Seleccionar —</option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Comentarios (opcional)
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: 10,
              borderRadius: 8,
              border: '1px solid #d8cdbd',
              resize: 'vertical',
            }}
          />
        </label>
        {error ? <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 8,
            padding: '12px 16px',
            background: '#004ac6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Enviando…' : 'Enviar encuesta'}
        </button>
      </form>
    </main>
  )
}
