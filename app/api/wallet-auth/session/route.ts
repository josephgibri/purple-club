import { NextResponse } from "next/server";
import { CampaignMode } from "@prisma/client";
import { getPbtcBalance } from "@/lib/wallet-session";
import {
  hasConciergeAccess,
  isAgentWallet,
  isFounderWallet,
  isPerksAdminWallet,
  readSession,
  setSessionCookie,
} from "@/lib/wallet-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  let pbtcBalance = session.pbtcBalance;
  try {
    pbtcBalance = await getPbtcBalance(session.wallet);
    if (pbtcBalance !== session.pbtcBalance) {
      await setSessionCookie(session.wallet, pbtcBalance);
    }
  } catch {
    // Keep the signed-in snapshot if the chain read fails.
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
      select: { email: true, emailVerifiedAt: true },
    }),
  ]);

  return NextResponse.json({
    authenticated: true,
    wallet: session.wallet,
    email: user?.email ?? null,
    emailVerified: Boolean(user?.email && user.emailVerifiedAt),
    pbtcBalance,
    pbtcEligible: pbtcBalance >= 1,
    isAgent: isAgentWallet(session.wallet),
    isFounder: isFounderWallet(session.wallet),
    isPerksAdmin: isPerksAdminWallet(session.wallet),
    isConcierge: hasConciergeAccess(session.wallet),
    isPromoter: promoterCampaign !== null,
  });
}
