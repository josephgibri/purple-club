import { NextResponse } from "next/server";

import { getTotalWeight, getWeight } from "@/lib/council";
import { db } from "@/lib/db";
import { readSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const weight = await getWeight(session.wallet);
  if (weight < 1) {
    return NextResponse.json({ error: "No seat held." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { title?: string; body?: string } | null;
  const title = body?.title?.trim() ?? "";
  const text = body?.body?.trim() ?? "";
  if (title.length < 3 || text.length < 3) {
    return NextResponse.json({ error: "A proposal needs a title and a decision." }, { status: 400 });
  }

  await db.user.upsert({
    where: { wallet: session.wallet },
    update: {},
    create: { wallet: session.wallet },
  });

  const total = await getTotalWeight();
  const proposal = await db.proposal.create({
    data: {
      createdByWallet: session.wallet,
      title: title.slice(0, 160),
      body: text.slice(0, 4000),
      type: "standard",
      status: "open",
      closesAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      quorumCc: Math.max(1, Math.ceil(total * 0.2)),
      yesPct: 51,
    },
  });

  return NextResponse.json({ id: proposal.id });
}
