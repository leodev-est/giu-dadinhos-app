import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidSession, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth";

const protectedPagePrefixes = ["/admin", "/dashboard", "/kanban", "/agenda"];
const protectedApiPrefixes = ["/api/pedidos", "/api/produtos"];
const LOGIN_PATH = "/admin/login";

function isProtectedPage(pathname: string) {
  if (pathname === LOGIN_PATH) return false;
  return protectedPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedApi(pathname: string, method: string) {
  if (pathname === "/api/pedidos" && method === "POST") {
    return false;
  }

  if (pathname === "/api/produtos" && method === "GET") {
    return false;
  }

  return protectedApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPage = isProtectedPage(pathname);
  const protectedApi = isProtectedApi(pathname, request.method);

  if (!protectedPage && !protectedApi) {
    return NextResponse.next();
  }

  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";

  if (!isValidSession(token)) {
    if (protectedPage) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return new NextResponse("Autenticacao necessaria.", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
