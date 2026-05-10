import { clearSessionCookie } from "@/lib/auth";

export async function POST(): Promise<Response> {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
