import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { normalizeRole } from "@/lib/rbac"
import { resolveNextAuthSecret } from "@/lib/auth-secret"
import { getPortalAdminPath } from "@/lib/portal-central/config"
import { isMultiTenant, sanitizeSlug, tenantSlugFromHost } from "@/lib/multitenant/registry"

const PORTAL_CENTRAL_HOST =
  String(process.env.PORTAL_CENTRAL_HOST || "").trim().toLowerCase() === "true"

const TENANT_ALLOW_OVERRIDE =
  String(process.env.TENANT_ALLOW_OVERRIDE || "").trim().toLowerCase() === "true"

/**
 * Cabeceras a reenviar al handler con el tenant resuelto de forma autoritativa
 * desde el subdominio. Se ELIMINA cualquier `x-tenant-slug` que venga del
 * cliente (evita que alguien fuerce leer otro tenant). Solo en modo pruebas
 * (`TENANT_ALLOW_OVERRIDE=true`) se permite `?tenant=` / `x-tenant-override`.
 */
function tenantHeaders(req: NextRequest): Headers {
  const fwd = new Headers(req.headers)
  fwd.delete("x-tenant-slug")
  if (!isMultiTenant()) return fwd

  let slug = tenantSlugFromHost(req.headers.get("host"))
  if (!slug && TENANT_ALLOW_OVERRIDE) {
    slug = sanitizeSlug(
      req.nextUrl.searchParams.get("tenant") || req.headers.get("x-tenant-override"),
    )
  }
  if (slug) fwd.set("x-tenant-slug", slug)
  return fwd
}

const LEGACY_ADMIN_PREFIXES = ["/__furvoley-config", "/_furvoley-config"]

function redirectLegacyAdminPath(req: NextRequest) {
  const path = req.nextUrl.pathname
  for (const legacy of LEGACY_ADMIN_PREFIXES) {
    if (path === legacy || path.startsWith(`${legacy}/`)) {
      const adminPath = getPortalAdminPath()
      const suffix = path.slice(legacy.length)
      return NextResponse.redirect(new URL(`/${adminPath}${suffix}`, req.url))
    }
  }
  return null
}

function isPortalPublicPath(path: string) {
  const adminPath = `/${getPortalAdminPath()}`
  return (
    path === "/portal" ||
    path.startsWith("/portal/") ||
    path === adminPath ||
    path.startsWith(`${adminPath}/`) ||
    path.startsWith("/api/portal-central/") ||
    path.startsWith("/api/portal/") ||
    path.startsWith("/api/mobile/")
  )
}

/** Rutas con UI antigua (Tailwind) eliminada: el CRM vive en /. */
const ADMIN_TO_CRM_TAB: { test: (p: string) => boolean; tab: string }[] = [
  { test: (p) => p === "/members" || p.startsWith("/members/"), tab: "socios" },
  { test: (p) => p === "/teams" || p.startsWith("/teams/"), tab: "equipos" },
  { test: (p) => p === "/payments" || p.startsWith("/payments/"), tab: "contabilidad" },
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), tab: "informes" },
  { test: (p) => p === "/workflows" || p.startsWith("/workflows/"), tab: "workflows" },
  { test: (p) => p === "/admin-overview" || p.startsWith("/admin-overview/"), tab: "dashboard" },
]

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "__Host-next-auth.session-token",
] as const

function redirectToLogin(req: NextRequest, clearCookies: boolean) {
  const login = new URL("/login", req.url)
  const callback = req.nextUrl.pathname + req.nextUrl.search
  if (callback && callback !== "/") {
    login.searchParams.set("callbackUrl", callback)
  }
  const res = NextResponse.redirect(login)
  if (clearCookies) {
    for (const name of SESSION_COOKIE_NAMES) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" })
    }
  }
  return res
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  const legacyAdmin = redirectLegacyAdminPath(req)
  if (legacyAdmin) return legacyAdmin

  // Tenant resuelto por subdominio; se reenvía a los handlers en cada pass-through.
  const fwd = tenantHeaders(req)
  const pass = () => NextResponse.next({ request: { headers: fwd } })

  if (isPortalPublicPath(path)) {
    return pass()
  }

  if (PORTAL_CENTRAL_HOST) {
    if (path === "/") {
      return NextResponse.redirect(new URL("/portal", req.url))
    }
    if (!path.startsWith("/_next") && path !== "/favicon.ico") {
      return NextResponse.redirect(new URL("/portal", req.url))
    }
    return pass()
  }

  // MCP Hermes: auth Bearer en la ruta, no sesión NextAuth (gateway en localhost).
  if (path.startsWith("/api/hermes/mcp")) {
    return pass()
  }

  // Portal SSO: verify (server-to-server) y consume token sin sesión previa.
  if (path.startsWith("/api/portal/")) {
    return pass()
  }

  // Enlaces públicos de workflows (/r/...) y API pública (sin login).
  if (path.startsWith("/r/") || path.startsWith("/api/public/")) {
    return pass()
  }

  // Detalle público de evento (sin login).
  const eventPublic = /^\/events\/([^/]+)$/.exec(path)
  if (eventPublic && eventPublic[1] !== "new") {
    return pass()
  }

  let token: Awaited<ReturnType<typeof getToken>> = null
  try {
    token = await getToken({
      req,
      secret: resolveNextAuthSecret(),
    })
  } catch {
    // Cookie firmada con otro NEXTAUTH_SECRET (clon, redeploy, etc.) — no
    // tumbar la página con 500; limpiamos sesión y mandamos al login.
    return redirectToLogin(req, true)
  }

  if (!token) {
    return redirectToLogin(req, false)
  }

  const role = normalizeRole(token.role)

  const mustChange = token.mustChangePassword === true
  const isChangePasswordRoute =
    path === "/change-password" || path.startsWith("/change-password/")
  const isChangePasswordApi = path.startsWith("/api/account/change-password")

  if (mustChange && !isChangePasswordRoute && !isChangePasswordApi) {
    const url = req.nextUrl.clone()
    url.pathname = "/change-password"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (path === "/crm") {
    const dest = new URL(req.url)
    dest.pathname = "/"
    return NextResponse.redirect(dest)
  }

  if (role === "ADMIN") {
    for (const { test, tab } of ADMIN_TO_CRM_TAB) {
      if (!test(path)) continue
      const u = req.nextUrl.clone()
      u.pathname = "/"
      const sp = new URLSearchParams(u.searchParams)
      sp.set("tab", tab)
      u.search = sp.toString()
      return NextResponse.redirect(u)
    }
  }

  if (path.startsWith("/accounting")) {
    if (!(role === "ADMIN" || role === "TREASURER")) {
      return NextResponse.redirect(new URL("/", req.url))
    }
  }

  const isEventsAdmin =
    path === "/events" ||
    path.startsWith("/events/new") ||
    /^\/events\/[^/]+\/edit/.test(path)

  if (isEventsAdmin) {
    if (!(role === "ADMIN" || role === "COACH")) {
      return NextResponse.redirect(new URL("/", req.url))
    }
  }

  return pass()
}

export const config = {
  matcher: [
    "/((?!login|join|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
