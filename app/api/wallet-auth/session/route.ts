import { NextResponse } from "next/server";
import { CampaignMode } from "@prisma/client";
import {
  hasConciergeAccess,
  isAgentWallet,
  isFounderWallet,
  isPerksAdminWallet,
  readSession,
} from "@/lib/wallet-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  // `isPromoter` is derived server-side from any UNIQUE_CODES campaign
  // assigned to this wallet (indexed lookup on InfluencerCampaign.promoterWallet).
  // The saved `email` (if any) lets the booking form autofill the address.
  const [promoterCampaign, user] = await Promise.all([
    db.influencerCampaign.findFirst({
      where: {
        mode: CampaignMode.UNIQUE_CODES,
        promoterWallet: session.wallet,
      },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { wallet: session.wallet },
      select: { email: true },
    }),
  ]);

  return NextResponse.json({
    authenticated: true,
    wallet: session.wallet,
    email: user?.email ?? null,
    pbtcBalance: session.pbtcBalance,
    pbtcEligible: session.pbtcBalance >= 1,
    isAgent: isAgentWallet(session.wallet),
    isFounder: isFounderWallet(session.wallet),
    isPerksAdmin: isPerksAdminWallet(session.wallet),
    isConcierge: hasConciergeAccess(session.wallet),
    isPromoter: promoterCampaign !== null,
  });
}
