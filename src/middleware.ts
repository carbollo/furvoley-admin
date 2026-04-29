import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

/** Rutas con UI antigua (Tailwind) eliminada: el CRM vive en /. */
const ADMIN_TO_CRM_TAB: { test: (p: string) => boolean; tab: string }[] = [
  { test: (p) => p === "/members" || p.startsWith("/members/"), tab: "socios" },
  { test: (p) => p === "/teams" || p.startsWith("/teams/"), tab: "equipos" },
  { test: (p) => p === "/payments" || p.startsWith("/payments/"), tab: "cobros" },
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), tab: "informes" },
  { test: (p) => p === "/workflows" || p.startsWith("/workflows/"), tab: "workflows" },
  { test: (p) => p === "/admin-overview" || p.startsWith("/admin-overview/"), tab: "dashboard" },
]

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (path === "/crm") {
      const dest = new URL(req.url)
      dest.pathname = "/"
      return NextResponse.redirect(dest)
    }

    if (token?.role === "ADMIN") {
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

    const adminRoutes = ["/accounting", "/billing"]

    if (adminRoutes.some(route => path.startsWith(route))) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }

    const isEventsAdmin =
      path === "/events" ||
      path.startsWith("/events/new") ||
      /^\/events\/[^/]+\/edit/.test(path)

    if (isEventsAdmin) {
      if (token?.role !== "ADMIN") {
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
