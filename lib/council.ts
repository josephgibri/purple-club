import { db } from "@/lib/db";

export type CouncilTally = {
  yesCc: number;
  noCc: number;
  abstainCc: number;
  totalCc: number;
};

export async function getWeight(wallet: string): Promise<number> {
  const rows = await db.$queryRaw<{ cc: number }[]>`
    SELECT COALESCE(cc, 0)::int AS cc
    FROM cc_balance
    WHERE wallet_pubkey = ${wallet}
  `;
  return rows[0]?.cc ?? 0;
}

export async function getTotalWeight(): Promise<number> {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(cc), 0)::int AS total FROM cc_balance WHERE cc > 0
  `;
  return rows[0]?.total ?? 0;
}

export async function closeExpiredProposals(): Promise<void> {
  const open = await db.proposal.findMany({
    where: { status: "open", closesAt: { lte: new Date() } },
  });
  for (const proposal of open) {
    const tally = await tallyProposal(proposal.id);
    const denom = tally.yesCc + tally.noCc;
    const yesRatio = denom > 0 ? (tally.yesCc / denom) * 100 : 0;
    const quorumOk = tally.totalCc >= proposal.quorumCc;
    const passed = quorumOk && yesRatio >= proposal.yesPct;
    await db.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "closed",
        result: passed ? "passed" : "failed",
      },
    });
  }
}

export async function tallyProposal(proposalId: number): Promise<CouncilTally> {
  const votes = await db.vote.findMany({
    where: { proposalId },
    select: { vote: true, weightCc: true },
  });
  const tally = { yesCc: 0, noCc: 0, abstainCc: 0, totalCc: 0 };
  for (const row of votes) {
    if (row.vote === "yes") tally.yesCc += row.weightCc;
    else if (row.vote === "no") tally.noCc += row.weightCc;
    else tally.abstainCc += row.weightCc;
  }
  tally.totalCc = tally.yesCc + tally.noCc + tally.abstainCc;
  return tally;
}
