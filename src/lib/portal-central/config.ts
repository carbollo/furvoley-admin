export function isPortalCentralHost() {
  return String(process.env.PORTAL_CENTRAL_HOST || '').trim().toLowerCase() === 'true'
}

export function getPortalAdminPath() {
  const raw = String(process.env.PORTAL_ADMIN_PATH || 'furvoley-config').trim()
  return raw.replace(/^\/+|\/+$/g, '') || 'furvoley-config'
}

export function getPortalDataDir() {
  return String(process.env.PORTAL_DATA_DIR || '/data').trim() || '/data'
}

export function getPortalPublicUrl() {
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim()
}
