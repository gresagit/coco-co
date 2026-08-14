import { NextRequest, NextResponse } from "next/server";

// Protección simple a nivel de cookie (la validación completa del usuario
// ocurre en el servidor con getSessionUser). Esto evita que alguien sin
// cookie llegue siquiera a renderizar el dashboard.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("cococo_session");
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
