import { getSafeServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { AuthCard, AuthScreen } from '@/components/auth/AuthScreen'
import { ChangePasswordForm } from './ChangePasswordForm'

export const dynamic = 'force-dynamic'

export default async function ChangePasswordPage() {
  const session = await getSafeServerSession()
  if (!session?.user) {
    redirect('/login')
  }

  const mustChange = (session.user as { mustChangePassword?: boolean }).mustChangePassword === true

  return (
    <AuthScreen background="#f9f9ff">
      <AuthCard maxWidth={480} style={{ padding: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,88,190,0.1)',
              color: '#0058be',
              marginBottom: 8,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#191b23',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            {mustChange ? 'Cambia tu contraseña' : 'Actualiza tu contraseña'}
          </h1>
          <p style={{ color: '#424754', fontSize: 14, marginTop: 4 }}>
            {mustChange
              ? 'Por seguridad, debes establecer una nueva contraseña antes de continuar.'
              : 'Introduce tu contraseña actual y una nueva para actualizar tu acceso.'}
          </p>
        </div>

        <div style={{ marginTop: 28 }}>
          <ChangePasswordForm forced={mustChange} />
        </div>
      </AuthCard>
    </AuthScreen>
  )
}
