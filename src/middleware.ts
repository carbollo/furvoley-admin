import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // Rutas solo para ADMIN
    const adminRoutes = ["/members", "/payments", "/accounting", "/teams", "/billing", "/reports"]
    
    if (adminRoutes.some(route => path.startsWith(route))) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    }
  }
)

export const config = {
  matcher: [
    "/((?!login|join|api/auth|_next/static|_next/image|favicon.ico).*)",
  ]
}
