"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { ArrowLeft, Lock, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import { MembershipPassCard } from "@/components/membership/membership-pass-card";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/swap/SOL-${PBTC_MINT}`;

/**
 * Standalone, deep-linkable membership pass. This is what holders bookmark
 * or "Add to Home Screen" — opening the saved icon goes straight to a
 * full-screen pass without needing to dig through the directory.
 *
 * The same `MembershipPassCard` used in the modal is reused here in its
 * `standalone` variant so behavior (QR, live clock, countdown) is
 * identical regardless of where it surfaces.
 */
export function PassClient() {
  const { publicKey, connected } = useWallet();
  const {
    balance,
    hasPbtc,
    isVerified,
    isMember,
    isLoading,
    error,
    authError,
    signaturePrefix,
    signedAtIso,
  } = useMembershipGate();
  const { enter, isPending, error: signInError } = useWalletSignIn();

  if (!isMember) {
    const stage: "connect" | "sign" | "buy" | "loading" = !connected
      ? "connect"
      : !isVerified
        ? "sign"
        : !hasPbtc
          ? "buy"
          : "loading";
    const issue = signInError ?? authError ?? error;

    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full rounded-3xl border border-gold-accent/40 bg-surface p-7 shadow-2xl shadow-black/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-accent/40 bg-black/40 text-gold-accent">
            {stage === "buy" ? <Lock size={22} /> : stage === "sign" ? <Wallet size={22} /> : <Sparkles size={22} />}
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {stage === "connect"
              ? "Connect to load your pass"
              : stage === "sign"
                ? "Sign to reveal your pass"
                : stage === "buy"
                  ? "Hold 1 PBTC to mint a pass"
                  : "Loading…"}
          </h1>
          <p className="mt-3 text-sm text-violet-100/75">
            {stage === "buy"
              ? `Your wallet is verified but holds ${balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} PBTC.`
              : "Verification is read-only — your tokens never leave your wallet."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            {stage === "buy" ? (
              <a
                href={JUPITER_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
              >
                <Lock size={14} />
                Buy 1 PBTC on Jupiter
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void enter()}
                disabled={isPending || isLoading}
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_60px_-15px_rgba(246,196,83,0.65)] transition hover:brightness-110 disabled:opacity-60"
              >
                <Sparkles size={14} />
                {isPending ? "Connecting…" : stage === "sign" ? "Sign to Enter" : "Enter Purple Club"}
              </button>
            )}
            {issue ? (
              <p className="max-w-xs text-xs text-rose-200">{issue}</p>
            ) : null}
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-violet-100/55 hover:text-violet-100/80"
            >
              <ArrowLeft size={12} />
              Back to landing
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-5 py-8 sm:py-12">
      <div className="scanline-overlay pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/directory"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/80 hover:border-white/20 hover:text-white"
          >
            <ArrowLeft size={12} />
            Directory
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
            <ShieldCheck size={12} />
            Verified
          </span>
        </div>

        <MembershipPassCard
          enabled
          walletAddress={publicKey?.toBase58()}
          pbtcBalance={balance}
          signaturePrefix={signaturePrefix}
          signedAtIso={signedAtIso}
          variant="standalone"
        />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-violet-100/75 backdrop-blur-xl">
          <p className="font-semibold text-gold-accent">Showing this pass</p>
          <p className="mt-1">
            Hand the merchant your phone, or let them point their camera at the
            QR. The QR resolves to{" "}
            <span className="font-mono text-violet-100/95">/verify</span> on any
            phone — no app needed.
          </p>
        </div>
      </div>
    </main>
  );
}
