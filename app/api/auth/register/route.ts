import { db } from "@/lib/db";
import { deriveUsername, registerSchema } from "@/lib/dbSchemas";
import { setSessionCookie, signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const data = parsed.data;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const role = adminEmails.includes(data.email.toLowerCase()) ? "ADMIN" : "MERCHANT";

  const emailLower = data.email.toLowerCase();
  const existing = await db.user.findUnique({
    where: { email: emailLower },
    select: { id: true },
  });
  if (existing) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  let username = deriveUsername(emailLower);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await db.user.findUnique({ where: { username }, select: { id: true } });
    if (!taken) break;
    username = `${deriveUsername(emailLower)}_${Math.random().toString(36).slice(2, 5)}`;
  }

  const passwordHash = await hashPassword(data.password);
  const user = await db.user.create({
    data: {
      email: emailLower,
      username,
      passwordHash,
      role,
      profile: {
        create: {
          displayName: data.displayName,
        },
      },
    },
    select: { id: true, email: true, username: true, role: true },
  });

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
