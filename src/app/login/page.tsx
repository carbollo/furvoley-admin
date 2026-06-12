'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { AuthCard, AuthScreen } from '@/components/auth/AuthScreen'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  color: '#334155',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 16,
  color: '#0f172a',
  boxSizing: 'border-box',
  marginBottom: 16,
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  border: 0,
  borderRadius: 10,
  padding: '12px 14px',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanEmail = email.trim().toLowerCase()
    const res = await signIn('credentials', {
      email: cleanEmail,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError('Credenciales inválidas')
    } else {
      const params = new URLSearchParams(window.location.search)
      const next = params.get('callbackUrl')
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
      window.location.assign(safe)
    }
  }

  return (
    <AuthScreen>
      <AuthCard maxWidth={448}>
        <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 800, textAlign: 'center', color: '#0f172a' }}>
          Iniciar Sesión
        </h1>

        {error ? (
          <div
            style={{
              background: '#fff1f2',
              color: '#be123c',
              border: '1px solid #fecdd3',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 14,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Correo electrónico</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />

          <label style={labelStyle}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />

          <button type="submit" style={buttonStyle}>
            Entrar
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
