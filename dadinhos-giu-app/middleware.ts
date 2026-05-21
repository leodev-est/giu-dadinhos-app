import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth";

const PROTECTED_PREFIXES = ["/admin", "/dashboard", "/agenda", "/kanban"];
const LOGIN_PATH = "/admin/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );

  if (!isProtected || pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";

  if (!isValidSession(token)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/agenda/:path*", "/kanban/:path*"],
};
