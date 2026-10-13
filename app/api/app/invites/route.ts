import { createMemberInvite, readAppAccount } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

export async function POST(request: Request) {
  const account = await readAppAccount(request);
  if (!account) return appJson({ error: "Sign in again." }, 401);
  const result = await createMemberInvite(account.id);
  if (!result.ok) return appJson({ error: result.error }, result.status);
  return appJson({ ok: true, code: result.code, remaining: result.remaining });
}
