import { grantKey, getInviteSettings } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";
import { prisma } from "@/lib/prisma";
import { isFounderWallet, readSession } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS() {
  return appOptions();
}

async function founder() {
  const session = await readSession();
  if (!session?.wallet || !isFounderWallet(session.wallet)) return null;
  return session;
}

export async function GET() {
  if (!(await founder())) return appJson({ error: "Founder access required." }, 403);
  const settings = await getInviteSettings();
  return appJson({ open: settings.open, memberCap: settings.memberCap });
}

export async function PATCH(request: Request) {
  if (!(await founder())) return appJson({ error: "Founder access required." }, 403);
  const body = (await request.json().catch(() => null)) as
    | { open?: boolean; memberCap?: number }
    | null;
  const memberCap = Number(body?.memberCap);
  if (typeof body?.open !== "boolean" || !Number.isInteger(memberCap) || memberCap < 0 || memberCap > 100) {
    return appJson({ error: "Set invites open or closed, and a cap from 0 to 100." }, 400);
  }
  const settings = await prisma.appInviteSettings.upsert({
    where: { id: "club" },
    update: { open: body.open, memberCap },
    create: { id: "club", open: body.open, memberCap },
  });
  return appJson({ open: settings.open, memberCap: settings.memberCap });
}

export async function POST(request: Request) {
  if (!(await founder())) return appJson({ error: "Founder access required." }, 403);
  const body = (await request.json().catch(() => null)) as { address?: string } | null;
  try {
    const result = await grantKey(body?.address ?? "");
    if (!result.ok) return appJson({ error: result.error }, result.status);
    return appJson({ ok: true, signature: result.signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The vault could not send the key.";
    return appJson({ error: message }, 500);
  }
}
