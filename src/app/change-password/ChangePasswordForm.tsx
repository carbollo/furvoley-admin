'use client'

import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  background: '#fff',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#334155',
  marginBottom: 6,
  display: 'block',
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter()
  const { update } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: forced ? undefined : currentPassword,
          newPassword,
          confirmPassword,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'No se pudo actualizar la contraseña')
        setLoading(false)
        return
      }
      setSuccess(true)
      // Refresca el JWT para que el middleware deje de redirigir.
      await update()
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 700)
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div
          style={{
            background: 'rgba(186,26,26,0.08)',
            color: '#b91c1c',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 13,
            border: '1px solid rgba(186,26,26,0.2)',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: 'rgba(16,185,129,0.1)',
            color: '#047857',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 13,
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          Contraseña actualizada. Redirigiendo…
        </div>
      )}

      {!forced && (
        <div>
          <label style={LABEL_STYLE}>Contraseña actual</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={INPUT_STYLE}
            required={!forced}
            autoComplete="current-password"
          />
        </div>
      )}

      <div>
        <label style={LABEL_STYLE}>Nueva contraseña</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={INPUT_STYLE}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>Repite la nueva contraseña</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={INPUT_STYLE}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <button
        type="submit"
        disabled={loading || success}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: '#0058be',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          cursor: loading || success ? 'not-allowed' : 'pointer',
          opacity: loading || success ? 0.7 : 1,
          marginTop: 4,
          boxShadow: '0 2px 8px rgba(0,88,190,0.25)',
        }}
      >
        {loading ? 'Guardando…' : success ? 'Contraseña actualizada' : 'Cambiar contraseña'}
      </button>

      {forced && (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginTop: 4,
            padding: '6px 0',
          }}
        >
          Cerrar sesión
        </button>
      )}
    </form>
  )
}
