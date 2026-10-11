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
  /**
   * When true, the gate unlocks as soon as the wallet is verified (signed in),
   * regardless of PBTC balance. Used by `/account` so any signed-in member can
   * always reach their own wallet details and hub, even while they hold less
   * than 1 PBTC. The PBTC-gated products (Hotels, Perks, Lend) keep their own
   * full gate.
   */
  unlockOnVerified?: boolean;
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
  unlockOnVerified = false,
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
    refresh,
  } = useMembershipGate();
  const { enter, isPending, error: signInError } = useWalletSignIn();

  if (isMember || (unlockOnVerified && isVerified)) {
    return <>{children}</>;
  }

  const stage: "connect" | "sign" | "buy" | "loading" = !connected
    ? "connect"
    : !isVerified
      ? "sign"
      : isLoading
        ? "loading"
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
          ? error
            ? "Couldn't read your balance"
            : "Add 1 PBTC to unlock"
          : "Loading…";

  const description =
    stage === "connect"
      ? connectDescription
      : stage === "sign"
        ? "One tap in your wallet proves ownership. No funds move; the signature is good for 24 hours."
        : stage === "buy"
          ? error
            ? "The wallet is verified. The on-chain read failed, so this is not a zero balance."
            : `Your wallet is verified but currently holds ${balance.toLocaleString(undefined, {
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

      <div className="w-full max-w-md border border-[var(--line)] bg-[var(--wall-2)] p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-[var(--line)] text-[var(--ink)]">
          {icon}
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
          {eyebrow}
        </p>
        <h1 className="club-display mt-2 text-3xl text-[var(--bone)]">{heading}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-[var(--bone-dim)]">{description}</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {stage === "buy" && error ? (
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex w-full max-w-xs items-center justify-center bg-[var(--ink)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
            >
              Retry balance check
            </button>
          ) : stage === "buy" ? (
            <a
              href={JUPITER_SWAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full max-w-xs items-center justify-center gap-2 bg-[var(--ink)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
            >
              <Lock size={14} />
              Buy 1 PBTC on Jupiter
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void enter()}
              disabled={isPending || isLoading}
              className="inline-flex w-full max-w-xs items-center justify-center gap-2 bg-[var(--ink)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)] disabled:opacity-60"
            >
              <Sparkles size={14} />
              {isPending
                ? "Connecting…"
                : stage === "sign"
                  ? "Sign to enter"
                  : "Enter Purple Club"}
            </button>
          )}
          {issue ? <p className="max-w-xs text-xs text-[var(--warn)]">{issue}</p> : null}
        </div>
      </div>
    </main>
  );
}
