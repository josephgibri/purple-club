import { restoreAppSession } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { address?: string; message?: string; signature?: string }
    | null;
  const result = await restoreAppSession(body?.address ?? "", body?.message ?? "", body?.signature ?? "");
  if (!result.ok) return appJson({ error: result.error }, result.status);
  return appJson({ ok: true, token: result.token, email: result.email });
}
