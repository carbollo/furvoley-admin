import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { normalizeRole } from "@/lib/rbac"

/** Rutas con UI antigua (Tailwind) eliminada: el CRM vive en /. */
const ADMIN_TO_CRM_TAB: { test: (p: string) => boolean; tab: string }[] = [
  { test: (p) => p === "/members" || p.startsWith("/members/"), tab: "socios" },
  { test: (p) => p === "/teams" || p.startsWith("/teams/"), tab: "equipos" },
  { test: (p) => p === "/payments" || p.startsWith("/payments/"), tab: "contabilidad" },
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), tab: "informes" },
  { test: (p) => p === "/workflows" || p.startsWith("/workflows/"), tab: "workflows" },
  { test: (p) => p === "/admin-overview" || p.startsWith("/admin-overview/"), tab: "dashboard" },
]

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname
    const role = normalizeRole(token?.role)

    // Si el usuario tiene marcado el cambio obligatorio de contraseña,
    // lo retenemos en /change-password hasta que la actualice.
    const mustChange = (token as { mustChangePassword?: boolean } | null)?.mustChangePassword === true
    const isChangePasswordRoute =
      path === "/change-password" || path.startsWith("/change-password/")
    const isChangePasswordApi = path.startsWith("/api/account/change-password")

    if (token && mustChange && !isChangePasswordRoute && !isChangePasswordApi) {
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
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        const m = /^\/events\/([^/]+)$/.exec(path)
        if (m && m[1] !== "new") {
          return true
        }
        return !!token
      }
    }
  }
)

export const config = {
  matcher: [
    "/((?!login|join|api/auth|_next/static|_next/image|favicon.ico).*)",
  ]
}
