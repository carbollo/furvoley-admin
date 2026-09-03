'use client'

import { useState } from 'react'

/**
 * «Mi cuenta»: cambiar el correo y la contraseña con los que uno entra.
 *
 * Cada persona cambia la suya y solo la suya, y siempre tecleando la actual: no
 * basta con tener la sesión abierta. Si alguien se deja el portátil sin
 * bloquear, que no pueda quedarse con la cuenta cambiándole el correo al dueño.
 *
 * Al guardar se cierra la sesión a propósito —el servidor invalida las que
 * había—, así que la pantalla avisa y lleva al login en vez de dejar al usuario
 * pulsando cosas que ya devuelven 401.
 */
export function MiCuentaModal({
  open,
  emailActual,
  onClose,
}: {
  open: boolean
  emailActual: string
  onClose: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)

  if (!open) return null

  const cambiaAlgo = Boolean(newEmail.trim() || newPassword)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/account/credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newEmail: newEmail.trim(),
          newPassword,
          confirmPassword,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo cambiar el acceso.')
        return
      }
      setHecho(true)
    } catch {
      setError('No hay conexión con el servidor. No se ha cambiado nada.')
    } finally {
      setBusy(false)
    }
  }

  const campo: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontFamily: 'inherit',
    fontSize: 13,
    color: 'var(--text-primary)',
    background: 'var(--surface-card)',
    outline: 'none',
    boxSizing: 'border-box',
  }
  const etiqueta: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 6,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi cuenta"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(15,23,42,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--surface-card)',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 20px 60px rgba(15,23,42,.25)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--text-primary)' }}>Mi cuenta</h2>

        {hecho ? (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 18px' }}>
              Acceso actualizado. Por seguridad se han cerrado todas las sesiones, también esta:
              vuelve a entrar con tus datos nuevos.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/login'
              }}
              style={{
                width: '100%',
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Volver a entrar
            </button>
          </>
        ) : (
          <form onSubmit={guardar}>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 18px' }}>
              Cambia el correo con el que entras, la contraseña, o las dos cosas. Deja en blanco lo
              que no quieras tocar.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Tu correo ahora</label>
              <div
                style={{
                  ...campo,
                  background: 'var(--surface-low)',
                  color: 'var(--text-secondary)',
                  userSelect: 'all',
                }}
              >
                {emailActual || '—'}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta} htmlFor="mc-nuevo-email">Correo nuevo</label>
              <input
                id="mc-nuevo-email"
                type="email"
                autoComplete="username"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Déjalo en blanco para no cambiarlo"
                style={campo}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta} htmlFor="mc-nueva-pass">Contraseña nueva</label>
              <input
                id="mc-nueva-pass"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                style={campo}
              />
            </div>

            {newPassword ? (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta} htmlFor="mc-repite-pass">Repite la contraseña nueva</label>
                <input
                  id="mc-repite-pass"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={
                    confirmPassword && confirmPassword !== newPassword
                      ? { ...campo, borderColor: 'var(--red)' }
                      : campo
                  }
                />
              </div>
            ) : null}

            <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <label style={etiqueta} htmlFor="mc-pass-actual">Tu contraseña actual</label>
              <input
                id="mc-pass-actual"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Para confirmar que eres tú"
                style={campo}
              />
            </div>

            {error ? (
              <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  background: 'var(--surface-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !currentPassword || !cambiaAlgo}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busy || !currentPassword || !cambiaAlgo ? 'not-allowed' : 'pointer',
                  opacity: busy || !currentPassword || !cambiaAlgo ? 0.65 : 1,
                }}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
