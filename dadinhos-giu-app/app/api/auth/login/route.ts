import { signSession, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Senha obrigatoria." }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!isAuthEnabled()) {
    return Response.json({ error: "Auth nao configurado." }, { status: 400 });
  }

  if (parsed.data.password !== adminPassword) {
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const token = signSession(adminPassword);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
    },
  });
}
