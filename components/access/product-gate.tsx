"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Lock, Sparkles, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { JUPITER_SWAP_URL } from "@/lib/constants";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

type ProductGateProps = {
  /** Small uppercase label above the locked-state heading. */
  eyebrow?: string;
  /** Heading shown at the "connect" stage (route-specific framing). */
  connectTitle: string;
  /** Body shown at the "connect" stage (route-specific framing). */
  connectDescription: string;
  /**
   * Optional richer marketing block rendered above the gate panel for
   * logged-out / non-member visitors — e.g. a Hotels or Perks explainer.
   */
  explainer?: ReactNode;
  /** The gated product. Rendered only once the visitor is a member. */
  children: ReactNode;
};

/**
 * Single shared membership gate for every product route (`/account`,
 * `/perks`, `/stay`). Logged-out / non-member visitors get a staged
 * connect → sign → buy explainer; members get the real product.
 *
 * This consolidates the near-identical gate panels that previously
 * lived inline in the directory and pass clients so the connect/sign/buy
 * UX stays consistent across the whole consolidated shell.
 */
export function ProductGate({
  eyebrow = "Member Access",
  connectTitle,
  connectDescription,
  explainer,
  children,
}: ProductGateProps) {
  const { connected } = useWallet();
  const {
    balance,
    hasPbtc,
    isVerified,
    isMember,
    isLoading,
    error,
    authError,
  } = useMembershipGate();
  const { enter, isPending, error: signInError } = useWalletSignIn();

  if (isMember) {
    return <>{children}</>;
  }

  const stage: "connect" | "sign" | "buy" | "loading" = !connected
    ? "connect"
    : !isVerified
      ? "sign"
      : !hasPbtc
        ? "buy"
        : "loading";

  const issue = signInError ?? authError ?? error;

  const heading =
    stage === "connect"
      ? connectTitle
      : stage === "sign"
        ? "Sign the read-only message"
        : stage === "buy"
          ? "Add 1 PBTC to unlock"
          : "Loading…";

  const description =
    stage === "connect"
      ? connectDescription
      : stage === "sign"
        ? "One tap in your wallet proves ownership. No funds move; the signature is good for 24 hours."
        : stage === "buy"
          ? `Your wallet is verified but currently holds ${balance.toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })} PBTC. Hold at least 1 PBTC to enter.`
          : "Reading your PBTC balance on-chain…";

  const icon =
    stage === "buy" ? (
      <Lock size={22} />
    ) : stage === "sign" ? (
      <Wallet size={22} />
    ) : (
      <Sparkles size={22} />
    );

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12">
      {explainer ? <div className="w-full">{explainer}</div> : null}

      <div className="w-full rounded-3xl border border-gold-accent/40 bg-surface p-8 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-accent/40 bg-black/40 text-gold-accent">
          {icon}
        </div>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-accent">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-violet-100/75">{description}</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {stage === "buy" ? (
            <a
              href={JUPITER_SWAP_URL}
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
              {isPending
                ? "Connecting…"
                : stage === "sign"
                  ? "Sign to Enter"
                  : "Enter Purple Club"}
            </button>
          )}
          {issue ? <p className="max-w-xs text-xs text-rose-200">{issue}</p> : null}
        </div>
      </div>
    </main>
  );
}
