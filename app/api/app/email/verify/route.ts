import { confirmAppEmailCode } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; code?: string } | null;
  const result = await confirmAppEmailCode(body?.email ?? "", body?.code ?? "");
  if (!result.ok) return appJson({ error: result.error }, result.status);
  return appJson({ ok: true, qualified: result.qualified });
}
