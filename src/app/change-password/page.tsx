import { getSafeServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from './ChangePasswordForm'

export const dynamic = 'force-dynamic'

export default async function ChangePasswordPage() {
  const session = await getSafeServerSession()
  if (!session?.user) {
    redirect('/login')
  }

  const mustChange = (session.user as { mustChangePassword?: boolean }).mustChangePassword === true

  return (
    <div
      className="w-screen min-h-screen flex items-center justify-center"
      style={{ background: '#f9f9ff', padding: 24 }}
    >
      <div
        className="w-full rounded-2xl"
        style={{
          maxWidth: 480,
          background: '#fff',
          border: '1px solid rgba(194,198,214,0.4)',
          boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
          padding: 36,
        }}
      >
        <div className="flex flex-col items-center text-center" style={{ gap: 8 }}>
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 64,
              height: 64,
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
      </div>
    </div>
  )
}
