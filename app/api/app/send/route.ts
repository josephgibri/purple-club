import { prepareMemberSend, submitMemberSend } from "@/lib/app-send";
import { readAppAccount } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS() {
  return appOptions();
}

export async function POST(request: Request) {
  const account = await readAppAccount(request);
  if (!account?.address) return appJson({ error: "Sign in again." }, 401);
  const body = (await request.json().catch(() => null)) as
    | { to?: string; amount?: string; transaction?: string }
    | null;

  try {
    if (body?.transaction) {
      const result = await submitMemberSend(account.address, body.transaction);
      const whole = Number(BigInt(result.amount) / 10n ** 9n);
      const fraction = Number(BigInt(result.amount) % 10n ** 9n) / 1e9;
      return appJson({ ok: true, amount: whole + fraction });
    }
    const prepared = await prepareMemberSend(account.address, body?.to ?? "", body?.amount ?? "");
    return appJson({ ok: true, transaction: prepared.transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = new Set([
      "Enter how much PBTC to send.",
      "That address is not valid.",
      "Send it to someone else.",
      "This is not a PBTC transfer.",
      "The key did not sign this transfer.",
      "This address does not hold that much PBTC.",
    ]);
    return appJson({ error: known.has(message) ? message : "The send could not be completed." }, 400);
  }
}
