import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (path === "/crm" && token && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url))
    }

    // Rutas solo para ADMIN
    const adminRoutes = [
      "/members",
      "/payments",
      "/accounting",
      "/teams",
      "/billing",
      "/reports",
      "/workflows",
      "/crm",
      "/admin-overview",
    ]

    if (adminRoutes.some(route => path.startsWith(route))) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }

    // Gestión de eventos: /events (lista), /events/new, /events/:id/edit
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
