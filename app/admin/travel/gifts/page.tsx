"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWalletSession } from "@/hooks/useWalletSession";

type GiftStatus =
  | "CREATED"
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED"
  | "REJECTED";

type CampaignClaimStatus =
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED";

type AdminGift = {
  id: string;
  code: string;
  status: GiftStatus;
  txSignature: string | null;
  agentNote: string | null;
  fulfillmentError: string | null;
  fulfillmentAttempts: number;
  fulfillmentStartedAt: string | null;
  recipientWallet: string | null;
  recipientEmail: string | null;
  createdAt: string;
  claimedAt: string | null;
  fulfilledAt: string | null;
  creator: { wallet: string; email: string } | null;
  recipient: { wallet: string; email: string } | null;
};

type StatsResponse = {
  generatedAt: string;
  gifts: {
    total: number;
    byStatus: Record<GiftStatus, number>;
  };
  campaigns: {
    total: number;
    active: number;
    paused: number;
    ended: number;
    claimsUsed: number;
    claimsCap: number;
    claims: {
      total: number;
      byStatus: Record<CampaignClaimStatus, number>;
    };
    maxRewardLamports: string;
  };
  treasury:
    | {
        ok: true;
        treasuryWallet: string;
        treasuryAta: string;
        solLamports: string;
        solBalance: number;
        pbtcLamports: string;
        pbtcAtaExists: boolean;
      }
    | { ok: false; error: string };
  failures: {
    gifts: Array<{
      id: string;
      code: string;
      recipientWallet: string | null;
      fulfillmentError: string | null;
      fulfillmentAttempts: number;
      fulfillmentStartedAt: string | null;
      claimedAt: string | null;
    }>;
    campaignClaims: Array<{
      id: string;
      recipientWallet: string;
      fulfillmentError: string | null;
      fulfillmentAttempts: number;
      fulfillmentStartedAt: string | null;
      claimedAt: string | null;
      campaign: { slug: string; label: string };
    }>;
  };
};

const PBTC_DECIMALS = 9;
const ONE_PBTC_LAMPORTS = 10n ** BigInt(PBTC_DECIMALS);

const STATUS_TONE: Record<GiftStatus, string> = {
  CREATED: "border border-[#7C3AED]/45 bg-[#7C3AED]/15 text-[#DDD6FE]",
  CLAIMED: "border border-[#EAB308]/45 bg-[#EAB308]/10 text-[#FDE68A]",
  FULFILLING: "border border-[#EAB308]/45 bg-[#EAB308]/10 text-[#FDE68A]",
  FULFILLED: "border border-emerald-300/40 bg-emerald-500/10 text-emerald-200",
  FULFILLMENT_FAILED: "border border-red-400/40 bg-red-500/10 text-red-200",
  REJECTED: "border border-red-400/30 bg-red-500/10 text-red-200",
};

const STATUS_LABEL: Record<GiftStatus, string> = {
  CREATED: "Awaiting claim",
  CLAIMED: "Auto-delivering",
  FULFILLING: "Auto-delivering",
  FULFILLED: "Delivered",
  FULFILLMENT_FAILED: "Delivery failed · retry",
  REJECTED: "Rejected",
};

function formatPbtc(lamports: string | bigint): string {
  let n: bigint;
  try {
    n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  } catch {
    return "0";
  }
  const whole = n / ONE_PBTC_LAMPORTS;
  const frac = n % ONE_PBTC_LAMPORTS;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(PBTC_DECIMALS, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

function formatSol(sol: number): string {
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function shortWallet(w: string | null | undefined): string {
  if (!w) return "—";
  if (w.length <= 12) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

export default function AdminGiftsPage() {
  const session = useWalletSession();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const [gifts, setGifts] = useState<AdminGift[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [giftsError, setGiftsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { tx: string; note: string }>>({});

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/travel/admin/stats", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load stats.");
      setStats(data as StatsResponse);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadGifts = useCallback(async () => {
    setGiftsLoading(true);
    setGiftsError(null);
    try {
      const res = await fetch("/api/travel/admin/gifts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load gifts.");
      setGifts(data.gifts as AdminGift[]);
    } catch (e) {
      setGiftsError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setGiftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.isFounder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
  }, [session.authenticated, session.isFounder, loadStats]);

  useEffect(() => {
    if (!showManual) return;
    if (!session.authenticated || !session.isFounder) return;
    if (gifts.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGifts();
  }, [showManual, session.authenticated, session.isFounder, gifts.length, loadGifts]);

  const lowVault = useMemo(() => {
    if (!stats || !stats.treasury.ok) return false;
    let pbtcLamports: bigint;
    try {
      pbtcLamports = BigInt(stats.treasury.pbtcLamports);
    } catch {
      return false;
    }
    let reward: bigint;
    try {
      reward = BigInt(stats.campaigns.maxRewardLamports);
    } catch {
      reward = 0n;
    }
    if (reward === 0n) reward = ONE_PBTC_LAMPORTS;
    return pbtcLamports < reward * 5n;
  }, [stats]);

  const lowSol = useMemo(() => {
    if (!stats || !stats.treasury.ok) return false;
    return stats.treasury.solBalance < 0.01;
  }, [stats]);

  function setDraft(id: string, patch: Partial<{ tx: string; note: string }>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { tx: prev[id]?.tx ?? "", note: prev[id]?.note ?? "", ...patch },
    }));
  }

  async function retryGift(giftId: string) {
    setPendingId(`gift:${giftId}`);
    try {
      const res = await fetch("/api/travel/admin/gifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: giftId, action: "retry_fulfillment" }),
      });
      const data = (await res.json()) as {
        fulfillment?: { ok?: boolean; reason?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not retry.");
      if (data.fulfillment?.ok) {
        toast.success("Delivered automatically.");
      } else {
        toast.error(data.fulfillment?.reason ?? "Retry did not complete.");
      }
      await Promise.all([loadStats(), showManual ? loadGifts() : Promise.resolve()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setPendingId(null);
    }
  }

  async function retryCampaignClaim(claimId: string) {
    setPendingId(`claim:${claimId}`);
    try {
      const res = await fetch("/api/travel/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_claim", claimId }),
      });
      const data = (await res.json()) as {
        fulfillment?: { ok?: boolean; reason?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not retry.");
      if (data.fulfillment?.ok) {
        toast.success("Campaign claim delivered.");
      } else {
        toast.error(data.fulfillment?.reason ?? "Retry did not complete.");
      }
      await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setPendingId(null);
    }
  }

  async function fulfilManually(gift: AdminGift) {
    const draft = drafts[gift.id] ?? { tx: "", note: "" };
    if (!draft.tx.trim()) {
      toast.error("Paste the Solana transaction signature first.");
      return;
    }
    setPendingId(`gift:${gift.id}`);
    try {
      const res = await fetch("/api/travel/admin/gifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gift.id,
          action: "mark_fulfilled",
          txSignature: draft.tx.trim(),
          agentNote: draft.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mark fulfilled.");
      toast.success("Gift marked as delivered.");
      await Promise.all([loadStats(), loadGifts()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark fulfilled.");
    } finally {
      setPendingId(null);
    }
  }

  async function rejectGift(gift: AdminGift) {
    const draft = drafts[gift.id] ?? { tx: "", note: "" };
    setPendingId(`gift:${gift.id}`);
    try {
      const res = await fetch("/api/travel/admin/gifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gift.id,
          action: "reject",
          agentNote: draft.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reject.");
      toast.success("Gift rejected.");
      await Promise.all([loadStats(), loadGifts()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject.");
    } finally {
      setPendingId(null);
    }
  }

  const gateMessage = !session.authenticated
    ? "Sign in with your founder wallet using the pill in the top-right."
    : !session.isFounder
      ? "Founder access only."
      : null;

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-25" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
              Concierge · Gifting Stats
            </span>
            <h1 className="pt-serif mt-2 text-4xl font-semibold text-white sm:text-5xl">
              Gifting Stats
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              Auto-delivery from the community treasury. This page is for monitoring and
              break-glass retries.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/stay"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white/65 hover:text-white"
            >
              ← Concierge desk
            </Link>
            <Link
              href="/admin/travel/campaigns"
              className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
            >
              Campaigns
            </Link>
            <button
              type="button"
              onClick={() => void loadStats()}
              className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
            >
              Refresh
            </button>
          </div>
        </div>

        {gateMessage ? (
          <div className="pt-glass rounded-2xl p-6 text-sm text-white/70">{gateMessage}</div>
        ) : (
          <>
            {statsError ? (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {statsError}
              </p>
            ) : null}

            {statsLoading && !stats ? (
              <p className="pt-glass rounded-2xl p-6 text-sm text-white/70">Loading stats…</p>
            ) : stats ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile
                    eyebrow="Gifts created"
                    value={stats.gifts.total.toLocaleString("en-US")}
                    sub={`${stats.gifts.byStatus.CREATED} awaiting claim`}
                  />
                  <StatTile
                    eyebrow="Auto-delivering"
                    value={(stats.gifts.byStatus.CLAIMED + stats.gifts.byStatus.FULFILLING).toLocaleString(
                      "en-US",
                    )}
                    sub="Treasury sending now"
                  />
                  <StatTile
                    eyebrow="Delivered"
                    value={stats.gifts.byStatus.FULFILLED.toLocaleString("en-US")}
                    sub={
                      stats.gifts.byStatus.FULFILLMENT_FAILED > 0
                        ? `${stats.gifts.byStatus.FULFILLMENT_FAILED} failed · retry below`
                        : "All delivered cleanly"
                    }
                    tone={stats.gifts.byStatus.FULFILLMENT_FAILED > 0 ? "warn" : "ok"}
                  />
                  <StatTile
                    eyebrow="Vault (PBTC)"
                    value={
                      stats.treasury.ok ? `${formatPbtc(stats.treasury.pbtcLamports)} PBTC` : "—"
                    }
                    sub={
                      !stats.treasury.ok
                        ? stats.treasury.error
                        : lowVault
                          ? "Low balance — top up soon"
                          : "Treasury vault funded"
                    }
                    tone={!stats.treasury.ok || lowVault ? "warn" : "ok"}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile
                    eyebrow="Treasury SOL (fees)"
                    value={
                      stats.treasury.ok ? `${formatSol(stats.treasury.solBalance)} SOL` : "—"
                    }
                    sub={
                      !stats.treasury.ok
                        ? "RPC unavailable"
                        : lowSol
                          ? "Low — fund SOL for tx fees"
                          : "Fee runway healthy"
                    }
                    tone={!stats.treasury.ok || lowSol ? "warn" : "ok"}
                  />
                  <StatTile
                    eyebrow="Campaigns active"
                    value={stats.campaigns.active.toLocaleString("en-US")}
                    sub={`${stats.campaigns.paused} paused · ${stats.campaigns.ended} ended`}
                  />
                  <StatTile
                    eyebrow="Campaign claims"
                    value={`${stats.campaigns.claimsUsed.toLocaleString("en-US")} / ${stats.campaigns.claimsCap.toLocaleString("en-US")}`}
                    sub={`${stats.campaigns.claims.byStatus.FULFILLED.toLocaleString("en-US")} delivered · ${stats.campaigns.claims.byStatus.FULFILLMENT_FAILED.toLocaleString("en-US")} failed`}
                    tone={
                      stats.campaigns.claims.byStatus.FULFILLMENT_FAILED > 0 ? "warn" : "ok"
                    }
                  />
                  <StatTile
                    eyebrow="Treasury wallet"
                    value={stats.treasury.ok ? shortWallet(stats.treasury.treasuryWallet) : "—"}
                    sub={
                      stats.treasury.ok
                        ? stats.treasury.pbtcAtaExists
                          ? "Vault ATA initialized"
                          : "Vault ATA missing — fund first"
                        : "—"
                    }
                    tone={
                      stats.treasury.ok && !stats.treasury.pbtcAtaExists ? "warn" : undefined
                    }
                  />
                </div>

                {(stats.failures.gifts.length > 0 ||
                  stats.failures.campaignClaims.length > 0) && (
                  <div className="mt-8">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                          Needs attention
                        </p>
                        <h2 className="pt-serif mt-1 text-2xl font-semibold text-white">
                          Failed deliveries
                        </h2>
                      </div>
                      <span className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200">
                        {stats.failures.gifts.length + stats.failures.campaignClaims.length} item(s)
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {stats.failures.gifts.map((g) => (
                        <article
                          key={g.id}
                          className="pt-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-400/25 px-5 py-4"
                        >
                          <div className="text-xs text-white/75">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">
                              Member gift
                            </p>
                            <p className="pt-ref-mono mt-1 text-[11px]">{g.code}</p>
                            <p className="mt-1 text-[11px] text-white/60">
                              Recipient {shortWallet(g.recipientWallet)} · attempts{" "}
                              {g.fulfillmentAttempts}
                            </p>
                            {g.fulfillmentError ? (
                              <p className="mt-1 max-w-xl break-words text-[11px] text-red-200">
                                {g.fulfillmentError}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void retryGift(g.id)}
                            disabled={pendingId === `gift:${g.id}`}
                            className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25 disabled:opacity-60"
                          >
                            {pendingId === `gift:${g.id}` ? "Retrying…" : "Retry auto-delivery"}
                          </button>
                        </article>
                      ))}

                      {stats.failures.campaignClaims.map((c) => (
                        <article
                          key={c.id}
                          className="pt-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-400/25 px-5 py-4"
                        >
                          <div className="text-xs text-white/75">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">
                              Campaign claim · {c.campaign.label}
                            </p>
                            <p className="pt-ref-mono mt-1 text-[11px]">/{c.campaign.slug}</p>
                            <p className="mt-1 text-[11px] text-white/60">
                              Recipient {shortWallet(c.recipientWallet)} · attempts{" "}
                              {c.fulfillmentAttempts}
                            </p>
                            {c.fulfillmentError ? (
                              <p className="mt-1 max-w-xl break-words text-[11px] text-red-200">
                                {c.fulfillmentError}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void retryCampaignClaim(c.id)}
                            disabled={pendingId === `claim:${c.id}`}
                            className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25 disabled:opacity-60"
                          >
                            {pendingId === `claim:${c.id}` ? "Retrying…" : "Retry auto-delivery"}
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-10 rounded-3xl border border-white/5 bg-white/[0.02] p-5">
                  <button
                    type="button"
                    onClick={() => setShowManual((s) => !s)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                    aria-expanded={showManual}
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                        Break-glass override
                      </p>
                      <h2 className="pt-serif mt-1 text-xl font-semibold text-white">
                        Manual fulfilment console
                      </h2>
                      <p className="mt-1 text-xs text-white/55">
                        Paste a transaction signature for any claimed gift if auto-delivery
                        cannot recover. Only use if a manual transfer was sent on-chain.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                      {showManual ? "Hide" : "Show"}
                    </span>
                  </button>

                  {showManual ? (
                    <div className="mt-5">
                      {giftsError ? (
                        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                          {giftsError}
                        </p>
                      ) : null}
                      {giftsLoading ? (
                        <p className="text-sm text-white/65">Loading gifts…</p>
                      ) : gifts.length === 0 ? (
                        <p className="text-sm text-white/65">
                          No gifts yet. Members unlock the gift slot after their first verified
                          booking.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {gifts.map((gift) => {
                            const draft = drafts[gift.id] ?? { tx: "", note: "" };
                            const showActions =
                              gift.status === "CLAIMED" ||
                              gift.status === "FULFILLING" ||
                              gift.status === "FULFILLMENT_FAILED";
                            return (
                              <article
                                key={gift.id}
                                className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]"
                              >
                                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
                                  <div>
                                    <p className="pt-ref-mono text-[11px] uppercase">
                                      {gift.code}
                                    </p>
                                    <p className="mt-1 text-[11px] text-white/55">
                                      Created {new Date(gift.createdAt).toLocaleString()}
                                      {gift.claimedAt
                                        ? ` · Claimed ${new Date(gift.claimedAt).toLocaleString()}`
                                        : ""}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${STATUS_TONE[gift.status]}`}
                                  >
                                    {STATUS_LABEL[gift.status]}
                                  </span>
                                </header>
                                <div className="grid gap-3 px-5 py-4 lg:grid-cols-2">
                                  <div className="text-[11px] text-white/65">
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                      Creator
                                    </p>
                                    <p className="pt-ref-mono mt-1">
                                      {gift.creator?.wallet ?? "—"}
                                    </p>
                                  </div>
                                  <div className="text-[11px] text-white/65">
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                      Recipient
                                    </p>
                                    <p className="pt-ref-mono mt-1">
                                      {gift.recipientWallet ??
                                        gift.recipient?.wallet ??
                                        "—"}
                                    </p>
                                  </div>
                                </div>
                                {showActions ? (
                                  <div className="border-t border-white/5 px-5 py-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                                        Manual tx signature
                                        <input
                                          className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                                          value={draft.tx}
                                          onChange={(e) =>
                                            setDraft(gift.id, { tx: e.target.value })
                                          }
                                          placeholder="(only if break-glass)"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                                        Internal note
                                        <input
                                          className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                                          value={draft.note}
                                          onChange={(e) =>
                                            setDraft(gift.id, { note: e.target.value })
                                          }
                                          placeholder="(optional)"
                                        />
                                      </label>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void retryGift(gift.id)}
                                        disabled={pendingId === `gift:${gift.id}`}
                                        className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25 disabled:opacity-60"
                                      >
                                        {pendingId === `gift:${gift.id}`
                                          ? "Working…"
                                          : "Retry auto-delivery"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void fulfilManually(gift)}
                                        disabled={
                                          pendingId === `gift:${gift.id}` || !draft.tx.trim()
                                        }
                                        className="pt-cta-gold rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-60"
                                      >
                                        {pendingId === `gift:${gift.id}`
                                          ? "Saving…"
                                          : "Manual mark delivered"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void rejectGift(gift)}
                                        disabled={pendingId === `gift:${gift.id}`}
                                        className="rounded-full border border-red-400/35 bg-red-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                                {gift.status === "FULFILLED" && gift.txSignature ? (
                                  <div className="border-t border-white/5 bg-emerald-500/5 px-5 py-3 text-[11px] text-emerald-100">
                                    Tx{" "}
                                    <span className="pt-ref-mono break-all text-emerald-100/80">
                                      {gift.txSignature}
                                    </span>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function StatTile({
  eyebrow,
  value,
  sub,
  tone,
}: {
  eyebrow: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const subClass =
    tone === "warn"
      ? "text-red-200"
      : tone === "ok"
        ? "text-emerald-200/80"
        : "text-white/55";
  return (
    <div className="pt-glass rounded-2xl border border-white/5 px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">{eyebrow}</p>
      <p className="pt-serif mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub ? <p className={`mt-1 text-[11px] ${subClass}`}>{sub}</p> : null}
    </div>
  );
}
