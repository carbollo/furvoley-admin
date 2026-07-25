'use client'

import { PortalLoginForm } from '@/components/portal/PortalLoginForm'
import { AuthCard, AuthScreen } from '@/components/auth/AuthScreen'

export default function PortalLoginPage() {
  return (
    <AuthScreen>
      <AuthCard>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, textAlign: 'center', color: '#1c1917' }}>ProClubCRM</h1>
        <p
          style={{
            margin: '0 0 24px',
            textAlign: 'center',
            color: '#78716c',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Inicia sesión y te llevaremos al panel de tu club.
        </p>
        <PortalLoginForm />
      </AuthCard>
    </AuthScreen>
  )
}
