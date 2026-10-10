import type { Metadata } from "next";

import { CouncilRoom } from "@/components/council/council-room";
import { closeExpiredProposals, getWeight, tallyProposal } from "@/lib/council";
import { db } from "@/lib/db";
import { readSession } from "@/lib/wallet-session";

export const metadata: Metadata = {
  title: "Council · Purple Club",
  description: "Contribution weight and recorded votes.",
};

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  donate_direct: "Donation",
  donate_stream: "Stream",
  lock: "Lock",
  lock_expired: "Lock expired",
  execution: "Execution",
  admin_grant: "Grant",
  admin_revoke: "Revoke",
  legacy_migration: "Earlier credit",
};

export default async function CouncilPage() {
  const session = await readSession();
  const wallet = session?.wallet ?? "";
  await closeExpiredProposals().catch(() => undefined);

  const [weight, proposals, ledger] = await Promise.all([
    wallet ? getWeight(wallet) : Promise.resolve(0),
    db.proposal.findMany({ orderBy: { closesAt: "asc" } }),
    wallet
      ? db.ccLedger.findMany({
          where: { wallet },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const views = await Promise.all(
    proposals.map(async (proposal) => {
      const tally = await tallyProposal(proposal.id);
      const mine = wallet
        ? await db.vote.findUnique({
            where: { proposalId_wallet: { proposalId: proposal.id, wallet } },
          })
        : null;
      return {
        id: proposal.id,
        title: proposal.title,
        body: proposal.body,
        status: proposal.status,
        closesAt: proposal.closesAt.toISOString().slice(0, 10),
        result: proposal.result,
        quorumCc: proposal.quorumCc,
        yesPct: proposal.yesPct,
        tally,
        myVote: mine?.vote ?? null,
      };
    }),
  );

  return (
    <CouncilRoom
      weight={weight}
      proposals={views}
      contributions={ledger.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString().slice(0, 10),
        source: SOURCE_LABEL[row.source] ?? row.source,
        amount: row.deltaCc,
        reason: row.reason,
      }))}
    />
  );
}
