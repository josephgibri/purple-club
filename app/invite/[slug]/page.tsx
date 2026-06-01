"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClaimProgressCard, ClaimTxRow } from "@/components/claim-progress";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { useWalletSession } from "@/hooks/useWalletSession";

type CampaignState = "live" | "paused" | "ended" | "exhausted";

type Campaign = {
  slug: string;
  label: string;
  maxClaims: number;
  claimsUsed: number;
  rewardLamports: string;
  endsAt: string;
  paused: boolean;
  state: CampaignState;
};

type ClaimStatus = "CLAIMED" | "FULFILLING" | "FULFILLED" | "FULFILLMENT_FAILED";

type Claim = {
  id: string;
  status: ClaimStatus;
  txSignature: string | null;
  claimedAt: string;
  fulfilledAt: string | null;
};

function formatPbtcFromLamports(raw: string) {
  try {
    const lamports = BigInt(raw);
    const whole = lamports / 1_000_000_000n;
    const frac = lamports % 1_000_000_000n;
    if (frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac.toString().padStart(9, "0").replace(/0+$/, "")}`;
  } catch {
    return raw;
  }
}

export default function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const session = useWalletSession();
  const [submitting, setSubmitting] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "This invite link is not valid.");
        setCampaign(null);
        return;
      }
      setLoadError(null);
      setCampaign(data.campaign as Campaign);
    } catch {
      setLoadError("Could not reach the invite service. Try again in a minute.");
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function submitClaim() {
    if (!session.authenticated) {
      toast.error("Connect your Solana wallet to claim.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        claim?: Claim;
        campaign?: Campaign;
        fulfillment?: { ok?: boolean; reason?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not claim.");
      if (data.fulfillment?.ok && data.claim?.status === "FULFILLED") {
        toast.success("1 PBTC delivered to your wallet.");
      } else {
        toast.success("Claim recorded. Delivery in progress…");
      }
      if (data.campaign) setCampaign(data.campaign);
      if (data.claim) setClaim(data.claim);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not claim.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-30" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-2xl px-6 py-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7C3AED]/40 bg-[#7C3AED]/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#DDD6FE]">
          A Purple drop
        </span>
        <h1 className="pt-serif mt-4 text-4xl font-semibold text-white sm:text-5xl">
          Claim your 1 PBTC
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/65">
          PBTC unlocks Purple Club — a private rate engine that negotiates wholesale hotel pricing
          for our community. Connect a Solana wallet, claim, and 1 PBTC is sent to you on-chain
          automatically.
        </p>

        <div className="pt-glass mt-8 rounded-3xl p-6">
          {loadError ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              {loadError}
              <p className="mt-2 text-[11px] text-white/55">
                Visit{" "}
                <Link href="/" className="text-[#FDE68A] underline">
                  purplestay.co
                </Link>{" "}
                to learn how membership works.
              </p>
            </div>
          ) : null}

          {!loadError && !campaign ? (
            <p className="text-sm text-white/65">Loading drop…</p>
          ) : null}

          {campaign ? (
            <>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Campaign</p>
                <p className="mt-1 text-sm font-semibold text-white">{campaign.label}</p>
                <p className="mt-2 text-[11px] text-white/55">
                  {campaign.claimsUsed} / {campaign.maxClaims} claimed ·{" "}
                  {formatPbtcFromLamports(campaign.rewardLamports)} PBTC each · ends{" "}
                  {new Date(campaign.endsAt).toLocaleString()}
                </p>
              </div>

              {campaign.state !== "live" ? (
                <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {campaign.state === "paused"
                    ? "This drop is currently paused. Try again later."
                    : campaign.state === "ended"
                      ? "This drop has ended."
                      : "This drop is fully claimed."}
                </div>
              ) : claim?.status === "FULFILLED" ? (
                <div className="mt-6 space-y-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                  <div>
                    <p className="text-base font-semibold text-emerald-50">
                      1 PBTC delivered to your wallet
                      {claim.fulfilledAt
                        ? ` · ${new Date(claim.fulfilledAt).toLocaleDateString()}`
                        : ""}
                    </p>
                    <p className="mt-1 text-emerald-100/85">
                      You&apos;re officially in the club. The next step is to
                      paste a hotel link on the homepage and let the concierge
                      negotiate a wholesale rate for you.
                    </p>
                  </div>
                  {/* Big primary CTA. The previous design buried "head to
                   * membership" as a small underlined inline link, which
                   * fresh-from-claim users (especially crypto-naive ones)
                   * walked past. We now point straight to `/` — the actual
                   * value action — and visually compete with the header
                   * "Bookings" link so the eye lands on the right next
                   * step. */}
                  <Link
                    href="/"
                    className="pt-cta-gold inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] sm:w-auto"
                  >
                    Browse hotels & start your stay →
                  </Link>
                  {claim.txSignature ? <ClaimTxRow signature={claim.txSignature} /> : null}
                </div>
              ) : claim?.status === "FULFILLMENT_FAILED" ? (
                <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <p>
                    Your claim was recorded but the on-chain transfer hit a
                    temporary issue. The concierge will retry automatically — refresh
                    in a couple of minutes to see the updated state. If this persists,
                    reply to your invite email and we&apos;ll sort it out.
                  </p>
                </div>
              ) : claim ? (
                <div className="mt-6 rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 p-4 text-sm text-[#FDE68A]">
                  Delivery in progress. Check back in a few seconds — refresh this page
                  once the on-chain transfer lands.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-white/70">
                    Your 1 PBTC is reserved. Connect a Solana wallet that
                    doesn&apos;t already hold PBTC and we&apos;ll send it on-chain
                    the moment you claim.
                  </p>

                  <OnboardingSteps authenticated={session.authenticated} />

                  {session.authenticated ? (
                    <>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                        Wallet connected ·{" "}
                        <span className="pt-ref-mono normal-case text-white/80">
                          {session.wallet?.slice(0, 4)}…{session.wallet?.slice(-4)}
                        </span>
                      </p>

                      <button
                        type="button"
                        onClick={() => void submitClaim()}
                        disabled={submitting}
                        className="pt-cta-gold w-full rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2.5"
                      >
                        {submitting ? "Claiming…" : "Claim my 1 PBTC"}
                      </button>

                      {submitting ? (
                        <ClaimProgressCard />
                      ) : (
                        <p className="text-[10px] text-white/45">
                          One claim per wallet. Purple Club sends 1 PBTC on Solana automatically as
                          soon as you claim — usually under a minute.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
