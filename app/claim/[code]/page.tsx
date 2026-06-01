"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClaimProgressCard, ClaimTxRow } from "@/components/claim-progress";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { useWalletSession } from "@/hooks/useWalletSession";

type GiftStatus =
  | "CREATED"
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED"
  | "REJECTED";

type GiftPayload = {
  code: string;
  status: GiftStatus;
  createdAt: string;
  claimedAt: string | null;
  fulfilledAt: string | null;
  txSignature: string | null;
  creatorWalletMasked: string | null;
  recipientWalletMasked: string | null;
  /** Set when this gift was minted under a UNIQUE_CODES campaign. */
  campaignLabel: string | null;
};

export default function ClaimGiftPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const [gift, setGift] = useState<GiftPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const session = useWalletSession();
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/gifts/${encodeURIComponent(upperCode)}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Gift not found.");
        setGift(null);
        return;
      }
      setLoadError(null);
      setGift(data.gift as GiftPayload);
    } catch {
      setLoadError("Could not reach the gifting service. Try again in a minute.");
    }
  }, [upperCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function claim() {
    if (!session.authenticated) {
      toast.error("Connect your Solana wallet to claim.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/gifts/${encodeURIComponent(upperCode)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        gift?: { status?: GiftStatus; txSignature?: string | null };
        fulfillment?: { ok?: boolean; signature?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not claim this gift.");
      if (data.fulfillment?.ok && data.gift?.status === "FULFILLED") {
        toast.success("1 PBTC delivered to your wallet.");
      } else {
        toast.success("Gift claimed. Delivery in progress…");
      }
      await refresh();
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
          {gift?.campaignLabel ? `From ${gift.campaignLabel}` : "A Purple gift"}
        </span>
        <h1 className="pt-serif mt-4 text-4xl font-semibold text-white sm:text-5xl">
          {gift?.campaignLabel
            ? "You've been invited to claim 1 PBTC"
            : "Someone gifted you 1 PBTC"}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/65">
          PBTC unlocks Purple Club — a concierge service that negotiates wholesale rates on
          luxury hotels for our community. Claim this gift and your 1 PBTC will be transferred
          to your wallet automatically the moment you claim.
        </p>

        <div className="pt-glass mt-8 rounded-3xl p-6">
          {loadError ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              {loadError}
              <p className="mt-2 text-[11px] text-white/55">
                Double-check the link with the friend who sent it, or visit{" "}
                <Link href="/" className="text-[#FDE68A] underline">
                  purplestay.co
                </Link>
                .
              </p>
            </div>
          ) : null}

          {!loadError && !gift ? (
            <p className="text-sm text-white/65">Loading gift…</p>
          ) : null}

          {gift ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                    Gift code
                  </p>
                  <p className="pt-ref-mono mt-1 text-sm text-white/85">{gift.code}</p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    gift.status === "CREATED"
                      ? "border-[#7C3AED]/45 bg-[#7C3AED]/15 text-[#DDD6FE]"
                      : gift.status === "CLAIMED" || gift.status === "FULFILLING"
                        ? "border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE68A]"
                        : gift.status === "FULFILLED"
                          ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                          : "border-red-400/30 bg-red-500/10 text-red-200"
                  }`}
                >
                  {gift.status === "CREATED"
                    ? "Awaiting claim"
                    : gift.status === "CLAIMED" || gift.status === "FULFILLING"
                      ? "Delivery in progress"
                      : gift.status === "FULFILLED"
                        ? "Delivered"
                        : gift.status === "FULFILLMENT_FAILED"
                          ? "Delivery retrying"
                          : "Closed"}
                </span>
              </div>

              {gift.status === "CREATED" ? (
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
                        onClick={() => void claim()}
                        disabled={submitting}
                        className="pt-cta-gold w-full rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2.5"
                      >
                        {submitting ? "Claiming…" : "Claim my 1 PBTC"}
                      </button>

                      {submitting ? (
                        <ClaimProgressCard />
                      ) : (
                        <p className="text-[10px] text-white/45">
                          1 PBTC is sent to your wallet automatically the moment you claim.
                          You&apos;ll get an on-chain transaction signature confirming delivery.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              ) : null}

              {gift.status === "CLAIMED" || gift.status === "FULFILLING" ? (
                <div className="mt-6 rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 p-4 text-sm text-[#FDE68A]">
                  Delivery in progress
                  {gift.recipientWalletMasked ? ` to ${gift.recipientWalletMasked}` : ""}.
                  Refresh in a few seconds — your 1 PBTC is on its way.
                </div>
              ) : null}

              {gift.status === "FULFILLMENT_FAILED" ? (
                <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Delivery hit a temporary network issue. We&apos;ll retry automatically — the
                  page will update once the transfer lands.
                </div>
              ) : null}

              {gift.status === "FULFILLED" ? (
                <div className="mt-6 space-y-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                  <div>
                    <p className="text-base font-semibold text-emerald-50">
                      1 PBTC delivered to your wallet
                      {gift.fulfilledAt
                        ? ` · ${new Date(gift.fulfilledAt).toLocaleDateString()}`
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
                  {gift.txSignature ? <ClaimTxRow signature={gift.txSignature} /> : null}
                </div>
              ) : null}

              {gift.status === "REJECTED" ? (
                <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                  This gift link was closed by the concierge.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
