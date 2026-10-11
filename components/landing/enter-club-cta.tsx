"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";

import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/?utm_source=phantom&utm_medium=list&buy=${PBTC_MINT}`;

/**
 * The single primary action on the landing page. The wall stays put.
 * A holder who has signed this visit gets a button into You.
 */
export function EnterClubCta() {
  const { connected } = useWallet();
  const { hasPbtc, isVerified, isMember, isLoading, error: balanceError, refresh } =
    useMembershipGate();
  const { enter, isPending, error } = useWalletSignIn();
  const router = useRouter();

  if (isLoading && connected) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex w-full max-w-sm items-center justify-center gap-2 border border-[var(--line)] bg-[var(--wall-2)] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone-dim)]"
      >
        <ShieldCheck size={16} className="animate-pulse" />
        Checking PBTC…
      </button>
    );
  }

  if (isMember) {
    return (
      <button
        type="button"
        onClick={() => router.push("/account")}
        className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-500/25"
      >
        <ShieldCheck size={16} />
        Enter the Club
      </button>
    );
  }

  if (connected && isVerified && !hasPbtc && balanceError) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
        >
          Retry balance check
        </button>
        <p className="text-center text-[11px] text-rose-200">
          Couldn&apos;t read this wallet on-chain. {balanceError}
        </p>
      </div>
    );
  }

  if (connected && isVerified && !hasPbtc) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <a
          href={JUPITER_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
        >
          <Lock size={16} />
          Buy 1 PBTC to Unlock
        </a>
        <p className="text-center text-[11px] text-violet-100/70">
          Wallet verified — add 1 PBTC and refresh to enter.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <button
        type="button"
        onClick={() => void enter()}
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)] disabled:opacity-60"
      >
        <Sparkles size={16} />
        {isPending ? "Connecting…" : "Enter Purple Club"}
      </button>
      {error ? (
        <p className="text-center text-[11px] text-rose-200">{error}</p>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.18em] text-violet-100/55">
          Read-only · 1 PBTC minimum
        </p>
      )}
    </div>
  );
}
