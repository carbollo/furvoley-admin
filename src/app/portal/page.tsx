'use client'

import { PortalLoginForm } from '@/components/portal/PortalLoginForm'

export default function PortalLoginPage() {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: 32,
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 28, textAlign: 'center' }}>Furvoley</h1>
        <p
          style={{
            margin: '0 0 24px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Inicia sesión y te llevaremos al panel de tu club.
        </p>
        <PortalLoginForm />
      </div>
    </div>
  )
}
