import { NextResponse } from "next/server";

import { getWeight } from "@/lib/council";
import { db } from "@/lib/db";
import { readSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

const CHOICES = new Set(["yes", "no", "abstain"]);

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    proposalId?: number;
    choice?: string;
  } | null;
  const proposalId = Number(body?.proposalId);
  const choice = body?.choice ?? "";
  if (!Number.isInteger(proposalId) || !CHOICES.has(choice)) {
    return NextResponse.json({ error: "Choose yes, no, or abstain." }, { status: 400 });
  }

  const weight = await getWeight(session.wallet);
  if (weight < 1) {
    return NextResponse.json({ error: "No seat held." }, { status: 403 });
  }

  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.status !== "open" || proposal.closesAt <= new Date()) {
    return NextResponse.json({ error: "That vote is closed." }, { status: 409 });
  }

  const existing = await db.vote.findUnique({
    where: { proposalId_wallet: { proposalId, wallet: session.wallet } },
  });
  if (existing) {
    return NextResponse.json({ error: "You already voted." }, { status: 409 });
  }

  await db.user.upsert({
    where: { wallet: session.wallet },
    update: {},
    create: { wallet: session.wallet },
  });

  await db.vote.create({
    data: {
      proposalId,
      wallet: session.wallet,
      vote: choice as "yes" | "no" | "abstain",
      weightCc: weight,
    },
  });

  return NextResponse.json({ ok: true });
}
