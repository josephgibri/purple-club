"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Tally = { yesCc: number; noCc: number; abstainCc: number };

function clubApi(path: string) {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  return `${basePath}${path}`;
}

export type CouncilProposalView = {
  id: number;
  title: string;
  body: string;
  status: string;
  closesAt: string;
  result: string | null;
  quorumCc: number;
  yesPct: number;
  tally: Tally;
  myVote: string | null;
};

export type ContributionLine = {
  id: number;
  at: string;
  source: string;
  amount: number;
  reason: string;
};

export function CouncilRoom({
  weight,
  proposals,
  contributions,
}: {
  weight: number;
  proposals: CouncilProposalView[];
  contributions: ContributionLine[];
}) {
  const open = proposals.filter((proposal) => proposal.status === "open");
  const closed = proposals.filter((proposal) => proposal.status !== "open");

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Council</p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)]">Votes</h1>
      <p className="mt-4 text-sm text-[var(--bone)]">
        {weight > 0 ? `Your weight is ${weight.toLocaleString()}.` : "No seat held."}
      </p>
      <p className="mt-1 text-sm text-[var(--bone-dim)]">
        Weight is contribution credit. Talk stays on Telegram. The vote is recorded here.
      </p>

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">Open</h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--bone-dim)]">No open votes.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {open.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} canVote={weight > 0} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">Record</h2>
        {closed.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--bone-dim)]">No recorded votes yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {closed.map((proposal) => (
              <li key={proposal.id} className="py-3">
                <p className="text-sm text-[var(--bone)]">{proposal.title}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--bone-faint)]">
                  {proposal.result ?? proposal.status} · yes {proposal.tally.yesCc} · no {proposal.tally.noCc}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {weight > 0 ? <NewProposal /> : null}

      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
          Your contributions
        </h2>
        {contributions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--bone-dim)]">No contribution recorded for this wallet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {contributions.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  <span className="text-sm text-[var(--bone)]">{line.source}</span>
                  <span className="mt-1 block text-[11px] text-[var(--bone-faint)]">
                    {line.at}
                    {line.reason ? ` · ${line.reason}` : ""}
                  </span>
                </span>
                <span className="text-sm text-[var(--bone)]">{line.amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ProposalCard({
  proposal,
  canVote,
}: {
  proposal: CouncilProposalView;
  canVote: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function vote(choice: "yes" | "no" | "abstain") {
    setPending(true);
    setError("");
    try {
      const response = await fetch(clubApi("/api/council/votes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, choice }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Vote failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Vote failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-5">
      <p className="text-sm text-[var(--bone)]">{proposal.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--bone-dim)]">{proposal.body}</p>
      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-[var(--bone-faint)]">
        Closes {proposal.closesAt} · yes {proposal.tally.yesCc} · no {proposal.tally.noCc}
        {proposal.myVote ? ` · your vote ${proposal.myVote}` : ""}
      </p>
      {canVote && !proposal.myVote ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["yes", "no", "abstain"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={pending}
              onClick={() => void vote(choice)}
              className="rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--bone)] disabled:opacity-50"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-[var(--warn)]">{error}</p> : null}
    </li>
  );
}

function NewProposal() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(clubApi("/api/council/proposals"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Could not open the vote.");
        return;
      }
      setTitle("");
      setBody("");
      router.refresh();
    } catch {
      setError("Could not open the vote.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">Open a vote</p>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        className="mt-3 w-full rounded-lg border border-[var(--line)] bg-[var(--wall)] px-3 py-2 text-sm text-[var(--bone)] outline-none"
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="The decision"
        rows={4}
        className="mt-3 w-full rounded-lg border border-[var(--line)] bg-[var(--wall)] px-3 py-2 text-sm text-[var(--bone)] outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--bone)] disabled:opacity-50"
      >
        {pending ? "Opening…" : "Open vote"}
      </button>
      {error ? <p className="mt-3 text-xs text-[var(--warn)]">{error}</p> : null}
    </form>
  );
}
