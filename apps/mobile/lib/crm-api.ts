import type { AuthSession } from './types'

async function crmFetch<T>(session: AuthSession, path: string, init?: RequestInit): Promise<T> {
  const base = session.tenantUrl.replace(/\/+$/, '')
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error((data as { error?: string }).error || `Error HTTP ${r.status}`)
  return data
}

export function getMe(session: AuthSession) {
  return crmFetch<{ user: unknown; branding: unknown }>(session, '/api/mobile/me')
}

export function getHome(session: AuthSession) {
  return crmFetch<Record<string, unknown>>(session, '/api/mobile/home')
}

export function getCalendar(session: AuthSession) {
  return crmFetch<{ events: unknown[] }>(session, '/api/mobile/calendar')
}

export function getBilling(session: AuthSession) {
  return crmFetch<{ debt: number; invoices: unknown[] }>(session, '/api/mobile/billing')
}

export function getMural(session: AuthSession) {
  return crmFetch<{ posts: unknown[] }>(session, '/api/mobile/mural')
}

export function getStaffDashboard(session: AuthSession) {
  return crmFetch<Record<string, unknown>>(session, '/api/crm/data')
}

export function getStaffMembers(session: AuthSession) {
  return crmFetch<{ socios: unknown[] }>(session, '/api/crm/members?page=1&pageSize=50')
}

export function getStaffTeams(session: AuthSession) {
  return crmFetch<{ teams: unknown[] }>(session, '/api/crm/teams')
}

export function changePassword(
  session: AuthSession,
  body: { newPassword: string; confirmPassword: string; currentPassword?: string },
) {
  return crmFetch<{ ok: boolean }>(session, '/api/account/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function createInvoiceCheckout(session: AuthSession, invoiceId: string) {
  return crmFetch<{ url: string }>(session, `/api/invoices/${invoiceId}/checkout`, {
    method: 'POST',
  })
}
