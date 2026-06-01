"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { useWalletSession } from "@/hooks/useWalletSession";

/**
 * Promoter portal — wallet-gated workspace for influencers running
 * a UNIQUE_CODES campaign. The promoter signs in with the wallet a
 * founder set on their campaign, mints a unique invite code per
 * person they want to invite, and shares the resulting
 * `/claim/{code}` link.
 *
 * Onboarding constraints we mirror from /claim and /invite:
 *   - Don't ask the promoter to do anything beyond Connect Wallet
 *     (we don't even ask for the recipient's wallet — minted codes
 *     are recipient-agnostic until redeemed).
 *   - Show running counts (X / Y minted, Z remaining) so the
 *     promoter doesn't accidentally over-distribute by minting more
 *     than the cap.
 *   - Recent minted codes are listed with copy-link buttons so the
 *     promoter can paste them into DMs without leaving the page.
 *
 * SIWS / wallet auth happens through the standard PurpleHeader pill
 * (same as /stay and /admin/stay). On Android Chrome the pill
 * routes through the shared AndroidWalletPicker, so the cold-start
 * flow is identical to the rest of the app.
 */

type GiftCodeStatus =
  | "CREATED"
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED"
  | "REJECTED";

type GiftCode = {
  id: string;
  code: string;
  status: GiftCodeStatus;
  recipientWallet: string | null;
  createdAt: string;
  claimedAt: string | null;
  fulfilledAt: string | null;
};

type PromoterCampaign = {
  id: string;
  label: string;
  notes: string | null;
  maxClaims: number;
  claimsUsed: number;
  rewardLamports: string;
  endsAt: string;
  paused: boolean;
  createdAt: string;
  giftClaims: GiftCode[];
};

function formatPbtcFromLamports(raw: string) {
  try {
    const lamports = BigInt(raw);
    const whole = lamports / 1_000_000_000n;
    const frac = lamports % 1_000_000_000n;
    if (frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac
      .toString()
      .padStart(9, "0")
      .replace(/0+$/, "")}`;
  } catch {
    return raw;
  }
}

function maskWallet(wallet: string | null | undefined) {
  if (!wallet) return null;
  if (wallet.length < 8) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export default function PromoterPage() {
  const session = useWalletSession();
  const [campaigns, setCampaigns] = useState<PromoterCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintingId, setMintingId] = useState<string | null>(null);
  // Tick `nowMs` once on mount and every 30s so the live/ended badge
  // updates without a render-time `Date.now()` (which violates React's
  // impure-call rule and breaks idempotent rendering).
  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/promoter/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load campaigns.");
      setCampaigns(data.campaigns as PromoterCampaign[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.wallet) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [session.authenticated, session.wallet, load]);

  async function mintInvite(c: PromoterCampaign) {
    setMintingId(c.id);
    try {
      const res = await fetch(
        `/api/promoter/campaigns/${encodeURIComponent(c.id)}/invites`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mint invite.");
      const claimUrl: string = data.claimUrl;
      // Best-effort clipboard write so the promoter can paste the
      // link straight into their DM. We still surface the URL on the
      // page in case the browser blocks navigator.clipboard.
      try {
        await navigator.clipboard.writeText(claimUrl);
        toast.success("Invite link minted and copied.");
      } catch {
        toast.success("Invite minted. Tap the code below to copy.");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mint invite.");
    } finally {
      setMintingId(null);
    }
  }

  async function copyClaim(code: string) {
    const url = `${window.location.origin}/claim/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Copy failed — please copy manually.");
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-25" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7C3AED]/35 bg-[#7C3AED]/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#DDD6FE]">
              Promoter Portal
            </span>
            <h1 className="pt-serif mt-2 text-4xl font-semibold text-white sm:text-5xl">
              Mint invite codes
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/65">
              Sign in with your assigned wallet to mint a unique invite link per
              person you want to gift Purple Club to. Each invite delivers PBTC
              and unlocks our private rates the moment it&apos;s claimed.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white/65 hover:text-white"
          >
            ← Home
          </Link>
        </div>

        {!session.authenticated ? (
          <article className="pt-glass rounded-3xl border border-white/5 p-6">
            <p className="pt-serif text-xl font-semibold text-white">
              Sign in to continue
            </p>
            <p className="mt-2 text-sm text-white/65">
              Use the wallet pill in the top-right to connect with the Solana
              wallet Purple Club assigned to your campaign. We use Sign-in with
              Solana — no password, no email.
            </p>
            <p className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/55">
              Wrong wallet? Disconnect from the pill and reconnect with the
              wallet listed on the email Purple Club sent you.
            </p>
          </article>
        ) : loading ? (
          <article className="pt-glass rounded-3xl border border-white/5 p-6 text-sm text-white/70">
            Loading your campaigns…
          </article>
        ) : error ? (
          <article className="pt-glass rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </article>
        ) : campaigns.length === 0 ? (
          <article className="pt-glass rounded-3xl border border-white/5 p-6">
            <p className="pt-serif text-lg font-semibold text-white">
              No campaigns assigned to this wallet
            </p>
            <p className="mt-2 text-sm text-white/65">
              The wallet you signed in with{" "}
              {session.wallet ? (
                <span className="pt-ref-mono text-white/80">
                  ({maskWallet(session.wallet)})
                </span>
              ) : null}{" "}
              isn&apos;t linked to any active campaign. Double-check you&apos;re
              using the wallet Purple Club sent you, or reach out to your contact
              to fix it.
            </p>
          </article>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const reward = formatPbtcFromLamports(c.rewardLamports);
              const ended = nowMs > 0 && new Date(c.endsAt).getTime() < nowMs;
              const remaining = Math.max(0, c.maxClaims - c.claimsUsed);
              const exhausted = remaining === 0;
              const canMint = !c.paused && !ended && !exhausted;
              return (
                <article
                  key={c.id}
                  className="pt-glass overflow-hidden rounded-3xl border border-white/5"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-4">
                    <div className="min-w-0">
                      <p className="pt-serif text-base font-semibold text-white">
                        {c.label}
                      </p>
                      <p className="mt-1 text-[11px] text-white/55">
                        Ends {new Date(c.endsAt).toLocaleString()} · {reward}{" "}
                        PBTC per invite
                      </p>
                      {c.notes ? (
                        <p className="mt-2 rounded-xl border border-white/5 bg-black/30 p-2 text-[11px] text-white/65">
                          {c.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          canMint
                            ? "border border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                            : c.paused
                              ? "border border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE68A]"
                              : "border border-red-400/30 bg-red-500/10 text-red-200"
                        }`}
                      >
                        {canMint
                          ? "Live"
                          : c.paused
                            ? "Paused"
                            : ended
                              ? "Ended"
                              : "Exhausted"}
                      </span>
                      <span className="text-[11px] text-white/55">
                        {c.claimsUsed} / {c.maxClaims} minted ·{" "}
                        <span className="text-white/80">{remaining} left</span>
                      </span>
                    </div>
                  </header>

                  <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => void mintInvite(c)}
                      disabled={!canMint || mintingId === c.id}
                      className="pt-cta-gold rounded-full px-5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-50"
                    >
                      {mintingId === c.id
                        ? "Minting…"
                        : "Mint a new invite"}
                    </button>
                    <span className="text-[11px] text-white/55">
                      Each click creates a one-shot link you can DM to one
                      person.
                    </span>
                  </div>

                  {c.giftClaims.length > 0 ? (
                    <div className="border-t border-white/5 px-6 py-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                        Recent invites
                      </p>
                      <ul className="mt-2 space-y-2 text-[12px] text-white/75">
                        {c.giftClaims.slice(0, 25).map((g) => (
                          <li
                            key={g.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => void copyClaim(g.code)}
                              className="pt-ref-mono break-all text-left text-white/85 hover:text-[#FDE68A]"
                              title="Copy claim link"
                            >
                              /claim/{g.code}
                            </button>
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="text-white/45">
                                {new Date(g.createdAt).toLocaleString()}
                              </span>
                              <span
                                className={
                                  g.status === "FULFILLED"
                                    ? "text-emerald-200"
                                    : g.status === "FULFILLMENT_FAILED"
                                      ? "text-red-200"
                                      : g.status === "CREATED"
                                        ? "text-white/55"
                                        : "text-[#FDE68A]"
                                }
                              >
                                {g.status === "CREATED"
                                  ? "Awaiting claim"
                                  : g.status === "CLAIMED"
                                    ? "Claimed"
                                    : g.status === "FULFILLED"
                                      ? "Delivered"
                                      : g.status === "FULFILLING"
                                        ? "Sending…"
                                        : g.status === "FULFILLMENT_FAILED"
                                          ? "Failed"
                                          : g.status}
                              </span>
                              <button
                                type="button"
                                onClick={() => void copyClaim(g.code)}
                                className="rounded-full border border-[#EAB308]/35 bg-[#EAB308]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
                              >
                                Copy
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="border-t border-white/5 px-6 py-3 text-[11px] text-white/45">
                      No invites minted yet. Mint your first one above.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
