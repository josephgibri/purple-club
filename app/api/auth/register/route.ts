import { db } from "@/lib/db";
import { registerSchema } from "@/lib/dbSchemas";
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
  const existing = await db.user.findFirst({
    where: {
      OR: [{ email: data.email.toLowerCase() }, { username: data.username.toLowerCase() }],
    },
    select: { id: true },
  });
  if (existing) {
    return Response.json({ error: "Email or username already in use." }, { status: 409 });
  }

  const passwordHash = await hashPassword(data.password);
  const user = await db.user.create({
    data: {
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
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
