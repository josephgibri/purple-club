import { z } from "zod";

import { hasPerksAdminAccess, readSession } from "@/lib/wallet-session";
import { db } from "@/lib/db";
import { sendListingRejectedEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const session = await readSession();
  if (!session || !hasPerksAdminAccess(session.wallet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rejectSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid reason" }, { status: 400 });
  }

  const listing = await db.merchantListing.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.reason,
      approvedAt: null,
      reviews: {
        create: {
          adminWallet: session.wallet,
          action: "REJECTED",
          notes: parsed.data.reason,
        },
      },
    },
    include: {
      profile: { include: { user: { select: { email: true } } } },
    },
  });

  void sendListingRejectedEmail({
    to: listing.profile.user.email,
    businessName: listing.businessName,
    reason: parsed.data.reason,
  });

  return Response.json({ ok: true, listing });
}
