import { db } from "@/lib/db";
import { formatZodError, loginSchema } from "@/lib/dbSchemas";
import { setSessionCookie, signSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;
  const identifier = data.identifier.toLowerCase();

  const user = await db.merchant.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }],
    },
    select: { id: true, email: true, username: true, role: true, passwordHash: true },
  });
  if (!user) {
    return Response.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    return Response.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await signSession({
    uid: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });
  await setSessionCookie(token);

  return Response.json({
    ok: true,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  });
}
