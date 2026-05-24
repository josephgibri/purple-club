"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Lock, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { MerchantDirectory } from "@/components/merchants/merchant-directory";
import { merchants as bundledMerchants, type Merchant } from "@/data/merchants";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/swap/SOL-${PBTC_MINT}`;

/**
 * The authenticated app surface. The old `/` had this directory always
 * rendered, blurred behind a "not connected" gate — confusing for
 * logged-out visitors and gave them no clear CTA. Here we replace the
 * blur with a proper gate panel that owns the focus when the holder
 * isn't a member yet, then swaps to the full directory once they are.
 */
export function DirectoryClient() {
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
  const [isPassOpen, setIsPassOpen] = useState(false);
  const [directoryMerchants, setDirectoryMerchants] = useState<Merchant[]>(bundledMerchants);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/public/merchants");
        if (!res.ok) return;
        const data = (await res.json()) as { merchants?: Merchant[] };
        if (!cancelled && data.merchants && data.merchants.length > 0) {
          setDirectoryMerchants(data.merchants);
        }
      } catch {
        // Fall back to bundled JSON merchants.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMember) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col items-center justify-center px-6 py-12">
        <DirectoryGate
          connected={connected}
          hasPbtc={hasPbtc}
          isVerified={isVerified}
          isLoading={isLoading}
          isPending={isPending}
          balance={balance}
          rpcError={error}
          authError={authError}
          signInError={signInError}
          onEnter={() => void enter()}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col px-6 py-8 sm:py-10">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
              Member directory
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your Purple Club perks.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-violet-100/75">
              Promo codes, addresses, and live offers — all unlocked. Show your
              pass at any Purple Hub in person.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 sm:inline-flex">
              <ShieldCheck size={14} />
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PBTC
            </span>
            <button
              type="button"
              onClick={() => setIsPassOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110"
            >
              <Sparkles size={14} />
              Open Pass
            </button>
          </div>
        </div>

        <div id="directory">
          <Suspense
            fallback={
              <div className="mt-6 text-sm text-violet-100/70">
                Loading merchant directory…
              </div>
            }
          >
            <MerchantDirectory merchants={directoryMerchants} />
          </Suspense>
        </div>
      </div>

      <DigitalMembershipPass
        isOpen={isPassOpen}
        onClose={() => setIsPassOpen(false)}
        walletAddress={publicKey?.toBase58()}
        pbtcBalance={balance}
        signaturePrefix={signaturePrefix}
        signedAtIso={signedAtIso}
      />
    </main>
  );
}

type DirectoryGateProps = {
  connected: boolean;
  hasPbtc: boolean;
  isVerified: boolean;
  isLoading: boolean;
  isPending: boolean;
  balance: number;
  rpcError: string | null;
  authError: string | null;
  signInError: string | null;
  onEnter: () => void;
};

function DirectoryGate({
  connected,
  hasPbtc,
  isVerified,
  isLoading,
  isPending,
  balance,
  rpcError,
  authError,
  signInError,
  onEnter,
}: DirectoryGateProps) {
  const stage: "connect" | "sign" | "buy" | "verified" = !connected
    ? "connect"
    : !isVerified
      ? "sign"
      : !hasPbtc
        ? "buy"
        : "verified";

  const issue = signInError ?? authError ?? rpcError;

  return (
    <div className="w-full rounded-3xl border border-gold-accent/40 bg-surface p-8 text-center shadow-2xl shadow-black/30">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-accent/40 bg-black/40 text-gold-accent">
        {stage === "buy" ? <Lock size={22} /> : stage === "sign" ? <Wallet size={22} /> : <Sparkles size={22} />}
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-accent">
        Member Access
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {stage === "connect"
          ? "Sign in to view the directory"
          : stage === "sign"
            ? "Sign the read-only message"
            : stage === "buy"
              ? "Add 1 PBTC to unlock"
              : "Loading your perks…"}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-violet-100/75">
        {stage === "connect"
          ? "Connect a Solana wallet that holds at least 1 PBTC. Verification is read-only — we never request transactions or transfers."
          : stage === "sign"
            ? "One-tap signature in your wallet proves ownership. No funds move, the signature is good for 24 hours."
            : stage === "buy"
              ? `Your wallet is verified but currently holds ${balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} PBTC. Hold at least 1 PBTC to enter.`
              : "Reading PBTC balance on-chain…"}
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
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
            onClick={onEnter}
            disabled={isPending || isLoading}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_60px_-15px_rgba(246,196,83,0.65)] transition hover:brightness-110 disabled:opacity-60"
          >
            <Sparkles size={14} />
            {isPending
              ? "Connecting…"
              : stage === "sign"
                ? "Sign to Enter"
                : "Enter Purple Club"}
          </button>
        )}
        {issue ? (
          <p className="max-w-xs text-xs text-rose-200">{issue}</p>
        ) : null}
      </div>
    </div>
  );
}
