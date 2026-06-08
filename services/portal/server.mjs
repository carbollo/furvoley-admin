import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac } from 'node:crypto'
import {
  clearAdminSessionCookie,
  getAdminPath,
  isAdminConfigured,
  isAdminRequest,
  setAdminSessionCookie,
  verifyAdminPassword,
} from './lib/admin-auth.mjs'
import {
  deleteTenant,
  listTenants,
  loadTenants,
  upsertTenant,
} from './lib/tenants-store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const port = Number(process.env.PORT || 3000)
const adminPath = getAdminPath()

function getSecret() {
  return String(process.env.PORTAL_SSO_SECRET || '').trim()
}

function signBody(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function createSsoToken(user, secret) {
  const payload = {
    sub: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    memberId: user.memberId,
    mustChangePassword: user.mustChangePassword,
    exp: Date.now() + 60_000,
    iss: 'furvoley-portal',
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

async function verifyOnTenant(tenant, email, password, secret) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const r = await fetch(`${tenant.url}/api/portal/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    })
    if (!r.ok) return null
    const data = await r.json()
    if (!data?.ok || !data?.user?.userId) return null
    return { tenant, user: data.user }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function readPublic(fileName) {
  return readFile(path.join(publicDir, fileName))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function requireAdmin(req, res) {
  if (!isAdminConfigured()) {
    sendJson(res, 503, { error: 'Panel admin no configurado. Define PORTAL_ADMIN_PASSWORD en Railway.' })
    return false
  }
  if (!isAdminRequest(req)) {
    sendJson(res, 401, { error: 'No autorizado.' })
    return false
  }
  return true
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/health') {
    const tenants = await loadTenants()
    return sendJson(res, 200, {
      ok: true,
      tenants: tenants.length,
      adminConfigured: isAdminConfigured(),
      adminPath: isAdminConfigured() ? `/${adminPath}` : null,
    })
  }

  if (pathname === `/${adminPath}` || pathname === `/${adminPath}/`) {
    if (req.method === 'GET') {
      const html = await readPublic('admin.html')
      return sendHtml(res, html.replaceAll('__ADMIN_PATH__', adminPath))
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (!isAdminConfigured()) {
      return sendJson(res, 503, { error: 'Define PORTAL_ADMIN_PASSWORD en Railway.' })
    }
    try {
      const body = await readBody(req)
      if (!verifyAdminPassword(body.password)) {
        return sendJson(res, 401, { error: 'Contraseña incorrecta.' })
      }
      setAdminSessionCookie(res)
      return sendJson(res, 200, { ok: true })
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido.' })
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    clearAdminSessionCookie(res)
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'GET' && pathname === '/api/admin/tenants') {
    if (!requireAdmin(req, res)) return
    const tenants = await listTenants()
    return sendJson(res, 200, { ok: true, tenants })
  }

  if (req.method === 'POST' && pathname === '/api/admin/tenants') {
    if (!requireAdmin(req, res)) return
    try {
      const body = await readBody(req)
      const { tenant, tenants } = await upsertTenant(body)
      return sendJson(res, 200, { ok: true, tenant, tenants })
    } catch (e) {
      return sendJson(res, 400, { error: e instanceof Error ? e.message : 'Error al guardar.' })
    }
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/tenants/')) {
    if (!requireAdmin(req, res)) return
    const id = decodeURIComponent(pathname.slice('/api/admin/tenants/'.length))
    try {
      const tenants = await deleteTenant(id)
      return sendJson(res, 200, { ok: true, tenants })
    } catch (e) {
      return sendJson(res, 404, { error: e instanceof Error ? e.message : 'No encontrado.' })
    }
  }

  if (req.method === 'POST' && pathname.startsWith('/api/admin/tenants/') && pathname.endsWith('/test')) {
    if (!requireAdmin(req, res)) return
    const id = decodeURIComponent(
      pathname.slice('/api/admin/tenants/'.length, -'/test'.length),
    )
    const secret = getSecret()
    if (!secret) return sendJson(res, 503, { error: 'Falta PORTAL_SSO_SECRET.' })
    const tenant = (await listTenants()).find((t) => t.id === id)
    if (!tenant) return sendJson(res, 404, { error: 'CRM no encontrado.' })
    try {
      const r = await fetch(`${tenant.url}/api/portal/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: '__portal_probe__', password: '__portal_probe__' }),
      })
      if (r.status === 401) {
        return sendJson(res, 200, {
          ok: true,
          reachable: true,
          message: 'CRM accesible (portal SSO activo).',
        })
      }
      if (r.status === 503) {
        return sendJson(res, 200, {
          ok: false,
          reachable: true,
          message: 'CRM responde pero falta PORTAL_SSO_SECRET en ese servicio.',
        })
      }
      return sendJson(res, 200, {
        ok: false,
        reachable: true,
        message: `CRM respondió HTTP ${r.status}. Revisa URL y redeploy.`,
      })
    } catch {
      return sendJson(res, 200, {
        ok: false,
        reachable: false,
        message: 'No se pudo conectar. Revisa la URL pública del CRM.',
      })
    }
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const secret = getSecret()
    const tenants = await loadTenants()
    if (!secret) {
      return sendJson(res, 503, { error: 'Falta PORTAL_SSO_SECRET en el portal.' })
    }
    if (tenants.length === 0) {
      return sendJson(res, 503, {
        error: `No hay CRMs configurados. Entra al panel admin /${adminPath}`,
      })
    }

    let body = {}
    try {
      body = await readBody(req)
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido.' })
    }

    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email y contraseña requeridos.' })
    }

    const matches = []
    for (const tenant of tenants) {
      const hit = await verifyOnTenant(tenant, email, password, secret)
      if (hit) matches.push(hit)
    }

    if (matches.length === 0) {
      return sendJson(res, 401, { error: 'Credenciales inválidas.' })
    }

    if (matches.length > 1) {
      return sendJson(res, 409, {
        error: 'Esta cuenta existe en varios clubs. Elige dónde entrar.',
        tenants: matches.map((m) => ({ id: m.tenant.id, name: m.tenant.name, url: m.tenant.url })),
      })
    }

    const { tenant, user } = matches[0]
    const token = createSsoToken(user, secret)
    const redirectUrl = `${tenant.url}/api/portal/sso?token=${encodeURIComponent(token)}`
    return sendJson(res, 200, {
      ok: true,
      tenant: { id: tenant.id, name: tenant.name, url: tenant.url },
      redirectUrl,
    })
  }

  if (req.method === 'POST' && pathname === '/api/login/tenant') {
    const secret = getSecret()
    const tenants = await loadTenants()
    if (!secret || tenants.length === 0) {
      return sendJson(res, 503, { error: 'Portal no configurado.' })
    }

    let body = {}
    try {
      body = await readBody(req)
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido.' })
    }

    const tenantId = String(body.tenantId || '').trim()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const tenant = tenants.find((t) => t.id === tenantId)
    if (!tenant) return sendJson(res, 404, { error: 'Club no encontrado.' })
    if (!email || !password) return sendJson(res, 400, { error: 'Email y contraseña requeridos.' })

    const hit = await verifyOnTenant(tenant, email, password, secret)
    if (!hit) return sendJson(res, 401, { error: 'Credenciales inválidas.' })

    const token = createSsoToken(hit.user, secret)
    return sendJson(res, 200, {
      ok: true,
      redirectUrl: `${tenant.url}/api/portal/sso?token=${encodeURIComponent(token)}`,
    })
  }

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const html = await readPublic('index.html')
    return sendHtml(res, html)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not found')
})

server.listen(port, async () => {
  const tenants = await loadTenants()
  process.stdout.write(
    `[portal] listening on :${port} tenants=${tenants.length} sso=${getSecret() ? 'yes' : 'no'} admin=${isAdminConfigured() ? `/${adminPath}` : 'off'}\n`,
  )
})
