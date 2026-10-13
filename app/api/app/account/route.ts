import { registerAppAddress } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; address?: string }
    | null;
  const result = await registerAppAddress(body?.email ?? "", body?.address ?? "");
  if (!result.ok) return appJson({ error: result.error }, result.status);
  return appJson({
    ok: true,
    token: result.token,
    qualified: result.qualified,
    paid: result.paid,
    payError: result.payError,
  });
}
