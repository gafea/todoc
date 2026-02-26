import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/timeline", "/my-todos", "/shared-with-me"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!needsAuth) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has("webauthn-session");
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/timeline/:path*", "/my-todos/:path*", "/shared-with-me/:path*"],
};
