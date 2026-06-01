"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/swap/SOL-${PBTC_MINT}`;

type EnterClubCtaProps = {
  /**
   * When true, a successful sign-in pushes the holder straight into
   * their account dashboard. The landing page sets this; gated pages
   * leave it false so the gate panel can stay in place without an
   * extra navigation loop.
   */
  redirectOnEnter?: boolean;
};

/**
 * The single primary action on the landing page. Status-aware so a
 * returning member who's already verified jumps straight to /account
 * without re-signing, while a logged-out visitor gets the gold CTA
 * that opens the wallet modal.
 */
export function EnterClubCta({ redirectOnEnter = true }: EnterClubCtaProps) {
  const { connected } = useWallet();
  const { hasPbtc, isVerified, isMember, isLoading } = useMembershipGate();
  const { enter, isPending, error } = useWalletSignIn();
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!redirectOnEnter) return;
    if (isMember && !navigatedRef.current) {
      navigatedRef.current = true;
      router.push("/account");
    }
  }, [isMember, redirectOnEnter, router]);

  if (isLoading && connected) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-gold-accent/40 bg-gradient-to-b from-[#1a0d33] to-[#120925] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-gold-accent/80"
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

  if (connected && isVerified && !hasPbtc) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <a
          href={JUPITER_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-accent px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_60px_-15px_rgba(246,196,83,0.65)] transition hover:brightness-110"
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-accent px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_60px_-15px_rgba(246,196,83,0.65)] transition hover:brightness-110 disabled:opacity-60"
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
