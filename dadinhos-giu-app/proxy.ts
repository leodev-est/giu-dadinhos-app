import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPagePrefixes = ["/admin", "/dashboard", "/kanban", "/agenda"];
const protectedApiPrefixes = ["/api/pedidos", "/api/produtos"];

function isProtectedPage(pathname: string) {
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

function isAuthorized(request: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return "missing_credentials";
  }

  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  const encodedCredentials = authorizationHeader.slice("Basic ".length).trim();

  try {
    const decodedCredentials = atob(encodedCredentials);
    const separatorIndex = decodedCredentials.indexOf(":");

    if (separatorIndex === -1) {
      return false;
    }

    const providedUser = decodedCredentials.slice(0, separatorIndex);
    const providedPassword = decodedCredentials.slice(separatorIndex + 1);

    return (
      providedUser === expectedUser && providedPassword === expectedPassword
    );
  } catch {
    return false;
  }
}

function unauthorizedResponse() {
  return new NextResponse("Autenticacao necessaria.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Dadinhos Giu", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const shouldProtect =
    isProtectedPage(pathname) || isProtectedApi(pathname, request.method);

  if (!shouldProtect) {
    return NextResponse.next();
  }

  const authorizationStatus = isAuthorized(request);

  if (authorizationStatus === "missing_credentials") {
    return new NextResponse(
      "ADMIN_USER e ADMIN_PASSWORD precisam estar configurados.",
      { status: 500 },
    );
  }

  if (!authorizationStatus) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
