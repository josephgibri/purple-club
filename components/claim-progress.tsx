"use client";

import { useEffect, useState } from "react";

/**
 * Shared UI for the gift / influencer claim flows. Both endpoints fire a
 * synchronous on-chain SPL transfer that takes 5-15 seconds end-to-end —
 * long enough that a disabled button is not enough feedback. These two
 * components fill that gap and dress up the success state with copy + a
 * Solscan link the claimer can use to verify the transfer.
 */

type Stage = { atMs: number; text: string };

const STAGES: readonly Stage[] = [
  { atMs: 0, text: "Preparing your wallet…" },
  { atMs: 3000, text: "Sending your PBTC on Solana…" },
  { atMs: 7000, text: "Waiting for on-chain confirmation…" },
  {
    atMs: 12000,
    text: "Almost there — Solana is finalising. This can take a moment.",
  },
];

export function ClaimProgressCard() {
  const [start] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Date.now() - start), 250);
    return () => window.clearInterval(id);
  }, [start]);

  const stage = STAGES.reduce(
    (current, candidate) => (elapsed >= candidate.atMs ? candidate : current),
    STAGES[0],
  );

  return (
    <div
      className="rounded-2xl border border-[#7C3AED]/35 bg-[#7C3AED]/10 p-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#DDD6FE]/30 border-t-[#DDD6FE]" />
        <p className="text-sm font-semibold text-[#DDD6FE]">{stage.text}</p>
      </div>
      <p className="mt-3 text-[11px] text-white/55">
        Please don&apos;t close this tab — your gift is on its way.
      </p>
    </div>
  );
}

export function ClaimTxRow({ signature }: { signature: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (rare on https) — silently fall through; the
      // user can still long-press the signature text or use the Solscan link.
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2">
      <code className="pt-ref-mono min-w-0 flex-1 truncate text-[11px] text-emerald-100/85">
        {signature}
      </code>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200 transition hover:text-emerald-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={`https://solscan.io/tx/${signature}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200 transition hover:text-emerald-100"
        >
          Solscan ↗
        </a>
      </div>
    </div>
  );
}
