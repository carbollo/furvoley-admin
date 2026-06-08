import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { normalizeRole } from "@/lib/rbac"

const PORTAL_CENTRAL_HOST =
  String(process.env.PORTAL_CENTRAL_HOST || "").trim().toLowerCase() === "true"

function isPortalPublicPath(path: string) {
  return (
    path === "/portal" ||
    path.startsWith("/portal/") ||
    path === "/__furvoley-config" ||
    path.startsWith("/__furvoley-config/") ||
    path.startsWith("/api/portal-central/") ||
    path.startsWith("/api/portal/")
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

  if (isPortalPublicPath(path)) {
    return NextResponse.next()
  }

  if (PORTAL_CENTRAL_HOST) {
    if (path === "/") {
      return NextResponse.redirect(new URL("/portal", req.url))
    }
    if (!path.startsWith("/_next") && path !== "/favicon.ico") {
      return NextResponse.redirect(new URL("/portal", req.url))
    }
    return NextResponse.next()
  }

  // MCP Hermes: auth Bearer en la ruta, no sesión NextAuth (gateway en localhost).
  if (path.startsWith("/api/hermes/mcp")) {
    return NextResponse.next()
  }

  // Portal SSO: verify (server-to-server) y consume token sin sesión previa.
  if (path.startsWith("/api/portal/")) {
    return NextResponse.next()
  }

  // Enlaces públicos de workflows (/r/...) y API pública (sin login).
  if (path.startsWith("/r/") || path.startsWith("/api/public/")) {
    return NextResponse.next()
  }

  // Detalle público de evento (sin login).
  const eventPublic = /^\/events\/([^/]+)$/.exec(path)
  if (eventPublic && eventPublic[1] !== "new") {
    return NextResponse.next()
  }

  let token: Awaited<ReturnType<typeof getToken>> = null
  try {
    token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
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

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!login|join|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
