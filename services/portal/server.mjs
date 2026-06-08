import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const port = Number(process.env.PORT || 3000)

function getSecret() {
  return String(process.env.PORTAL_SSO_SECRET || '').trim()
}

function parseTenants() {
  const raw = String(process.env.PORTAL_TENANTS || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((t) => ({
        id: String(t?.id || '').trim(),
        name: String(t?.name || t?.id || '').trim(),
        url: String(t?.url || '').trim().replace(/\/+$/, ''),
      }))
      .filter((t) => t.id && t.url)
  } catch {
    return []
  }
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

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, tenants: parseTenants().length })
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const secret = getSecret()
    const tenants = parseTenants()
    if (!secret) {
      return sendJson(res, 503, { error: 'Falta PORTAL_SSO_SECRET en el portal.' })
    }
    if (tenants.length === 0) {
      return sendJson(res, 503, { error: 'Falta PORTAL_TENANTS en el portal.' })
    }

    let body = {}
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
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

  if (req.method === 'POST' && url.pathname === '/api/login/tenant') {
    const secret = getSecret()
    const tenants = parseTenants()
    if (!secret || tenants.length === 0) {
      return sendJson(res, 503, { error: 'Portal no configurado.' })
    }

    let body = {}
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
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

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await readPublic('index.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(html)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not found')
})

server.listen(port, () => {
  const tenants = parseTenants()
  process.stdout.write(
    `[portal] listening on :${port} tenants=${tenants.length} secret=${getSecret() ? 'yes' : 'no'}\n`,
  )
})
