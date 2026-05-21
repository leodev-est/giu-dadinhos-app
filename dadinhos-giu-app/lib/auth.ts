import { createHmac } from "crypto";

const SESSION_COOKIE = "giu_session";
const SALT = "giu-dadinhos-2026";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function signSession(password: string): string {
  return createHmac("sha256", SALT).update(password).digest("hex");
}

export function isValidSession(token: string): boolean {
  const password = getAdminPassword();
  if (!password) return true; // sem senha configurada = modo dev aberto
  const expected = signSession(password);
  return token === expected;
}

export function isAuthEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export { SESSION_COOKIE };
