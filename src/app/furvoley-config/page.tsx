import { AuthScreen } from '@/components/auth/AuthScreen'
import { PortalAdminPanel } from '@/components/portal/PortalLoginForm'
import { getPortalAdminPath, isPortalCentralHost } from '@/lib/portal-central/config'

export default function PortalAdminPage() {
  const adminPath = getPortalAdminPath()

  if (!isPortalCentralHost()) {
    return (
      <AuthScreen background="#1c1917">
        <div style={{ maxWidth: 520, lineHeight: 1.6, color: '#faf7f2' }}>
          <h1 style={{ marginTop: 0 }}>Panel admin del portal</h1>
          <p>
            Este servicio es un <strong>CRM</strong>, no el portal central. El panel{' '}
            <code>/{adminPath}</code> solo funciona en el servicio Railway marcado como portal.
          </p>
          <p style={{ color: '#a8a29e' }}>
            Crea un servicio aparte con <code>PORTAL_CENTRAL_HOST=true</code> o usa el servicio portal
            dedicado. Ver <code>services/portal/README.md</code>.
          </p>
        </div>
      </AuthScreen>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#0a0a0a' }}>
      <PortalAdminPanel />
    </div>
  )
}
