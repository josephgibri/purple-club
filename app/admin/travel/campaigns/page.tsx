"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PurpleHeader } from "@/components/purple-header";

type CampaignClaimStatus =
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED";

type GiftClaimStatus =
  | "CREATED"
  | "CLAIMED"
  | "FULFILLING"
  | "FULFILLED"
  | "FULFILLMENT_FAILED"
  | "REJECTED";

type CampaignMode = "PUBLIC_SLUG" | "UNIQUE_CODES";

type Claim = {
  id: string;
  recipientWallet: string;
  recipientEmail: string | null;
  status: CampaignClaimStatus;
  txSignature: string | null;
  fulfillmentError: string | null;
  fulfillmentAttempts: number;
  claimedAt: string;
  fulfilledAt: string | null;
};

type GiftCode = {
  id: string;
  code: string;
  status: GiftClaimStatus;
  recipientWallet: string | null;
  recipientEmail: string | null;
  createdAt: string;
  claimedAt: string | null;
  fulfilledAt: string | null;
  txSignature: string | null;
};

type Campaign = {
  id: string;
  slug: string;
  label: string;
  notes: string | null;
  maxClaims: number;
  claimsUsed: number;
  rewardLamports: string;
  endsAt: string;
  paused: boolean;
  createdByWallet: string | null;
  mode: CampaignMode;
  promoterWallet: string | null;
  createdAt: string;
  updatedAt: string;
  claims: Claim[];
  giftClaims: GiftCode[];
};

type SessionState = {
  authenticated: boolean;
  isMaintainer?: boolean;
  isAdmin?: boolean;
  isAgent?: boolean;
  isFounder?: boolean;
  wallet?: string;
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

function formatLocalDateInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzAdjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tzAdjusted.toISOString().slice(0, 16);
}

export default function AdminCampaignsPage() {
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);

  const [draftLabel, setDraftLabel] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftMax, setDraftMax] = useState("");
  const [draftEnds, setDraftEnds] = useState("");
  const [draftReward, setDraftReward] = useState("1");
  const [draftMode, setDraftMode] = useState<CampaignMode>("PUBLIC_SLUG");
  const [draftPromoterWallet, setDraftPromoterWallet] = useState("");

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
      const res = await fetch("/api/travel/admin/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load campaigns.");
      setCampaigns(data.campaigns as Campaign[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.isFounder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [session.authenticated, session.isFounder, load]);

  async function createCampaign() {
    if (!draftLabel.trim()) {
      toast.error("Add a campaign name.");
      return;
    }
    const max = Number(draftMax);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Set a max number of claims.");
      return;
    }
    if (!draftEnds) {
      toast.error("Set a deadline.");
      return;
    }
    const reward = Number(draftReward);
    if (!Number.isFinite(reward) || reward <= 0) {
      toast.error("Reward must be a positive number of PBTC.");
      return;
    }
    if (draftMode === "UNIQUE_CODES" && !draftPromoterWallet.trim()) {
      toast.error("Add the promoter's Solana wallet so they can sign in to /promoter.");
      return;
    }
    setPendingId("new");
    try {
      const res = await fetch("/api/travel/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draftLabel.trim(),
          notes: draftNotes.trim() || undefined,
          maxClaims: max,
          endsAt: new Date(draftEnds).toISOString(),
          rewardPbtc: reward,
          mode: draftMode,
          promoterWallet:
            draftMode === "UNIQUE_CODES" ? draftPromoterWallet.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create campaign.");
      toast.success("Campaign created.");
      setDraftLabel("");
      setDraftNotes("");
      setDraftMax("");
      setDraftEnds("");
      setDraftReward("1");
      setDraftMode("PUBLIC_SLUG");
      setDraftPromoterWallet("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create campaign.");
    } finally {
      setPendingId(null);
    }
  }

  async function updatePromoter(campaign: Campaign, wallet: string) {
    setPendingId(campaign.id);
    try {
      const res = await fetch("/api/travel/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          action: "update_promoter",
          promoterWallet: wallet.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update promoter wallet.");
      toast.success("Promoter wallet updated.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setPendingId(null);
    }
  }

  async function patch(campaign: Campaign, action: "pause" | "resume" | "extend", endsAt?: string) {
    setPendingId(campaign.id);
    try {
      const res = await fetch("/api/travel/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, action, endsAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update campaign.");
      toast.success("Campaign updated.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(campaign: Campaign) {
    if (!confirm(`Delete campaign "${campaign.label}"? This cannot be undone.`)) return;
    setPendingId(campaign.id);
    try {
      const res = await fetch(`/api/travel/admin/campaigns?id=${encodeURIComponent(campaign.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete.");
      toast.success("Campaign deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setPendingId(null);
    }
  }

  async function copyInvite(slug: string) {
    const url = `${window.location.origin}/invite/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Copy failed — please copy manually.");
    }
  }

  async function copyPromoterPortal() {
    const url = `${window.location.origin}/promoter`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Promoter portal link copied.");
    } catch {
      toast.error("Copy failed — please copy manually.");
    }
  }

  const gateMessage = !session.authenticated
    ? "Sign in with your founder wallet using the pill in the top-right."
    : !session.isFounder
      ? "Founder access only."
      : null;

  const minDateInput = useMemo(() => {
    if (!nowMs) return "";
    const d = new Date(nowMs + 60 * 60 * 1000);
    return formatLocalDateInput(d.toISOString());
  }, [nowMs]);

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-25" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <PurpleHeader onSessionChange={setSession} />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
              Concierge · Influencer Campaigns
            </span>
            <h1 className="pt-serif mt-2 text-4xl font-semibold text-white sm:text-5xl">
              Influencer Drops
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              Create one shareable invite link per campaign. Set a claim cap and a deadline.
              Each new wallet that opens the link receives 1 PBTC automatically until the cap or
              deadline is reached.
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
              href="/admin/travel/gifts"
              className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
            >
              Gifting stats
            </Link>
            <button
              type="button"
              onClick={() => void load()}
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
            <article className="pt-glass mb-6 rounded-3xl border border-white/5 p-6">
              <h2 className="pt-serif text-xl font-semibold text-white">New campaign</h2>
              <p className="mt-1 text-xs text-white/55">
                Choose how invites are distributed. Public link works like the legacy flow — one
                shared URL, capped by max claims. Unique codes lets the promoter sign in to
                /promoter with their wallet and mint one-shot codes per invitee for tighter
                control.
              </p>

              <fieldset className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                <legend className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/55">
                  Distribution mode
                </legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-black/30 p-3 hover:border-white/20">
                  <input
                    type="radio"
                    name="campaign-mode"
                    value="PUBLIC_SLUG"
                    checked={draftMode === "PUBLIC_SLUG"}
                    onChange={() => setDraftMode("PUBLIC_SLUG")}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Public link · /invite/{`{slug}`}
                    </p>
                    <p className="text-[11px] text-white/55">
                      Anyone with the link can claim once per wallet, up to max claims. Easiest to
                      share but can be amplified beyond the influencer&apos;s reach.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-black/30 p-3 hover:border-white/20">
                  <input
                    type="radio"
                    name="campaign-mode"
                    value="UNIQUE_CODES"
                    checked={draftMode === "UNIQUE_CODES"}
                    onChange={() => setDraftMode("UNIQUE_CODES")}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Unique codes · promoter portal
                    </p>
                    <p className="text-[11px] text-white/55">
                      Promoter signs in to /promoter with the wallet you set below and mints
                      one-shot /claim/{`{code}`} links per invitee. Each minted code counts toward
                      max claims.
                    </p>
                  </div>
                </label>
              </fieldset>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Campaign name *
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="e.g. Travel-Influencer X · April"
                  />
                </label>
                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Internal notes
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="(optional)"
                  />
                </label>
                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Max claims *
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    type="number"
                    min={1}
                    max={100000}
                    value={draftMax}
                    onChange={(e) => setDraftMax(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </label>
                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Deadline (local time) *
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    type="datetime-local"
                    min={minDateInput}
                    value={draftEnds}
                    onChange={(e) => setDraftEnds(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Reward per claim (PBTC) *
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    type="number"
                    min={0.000000001}
                    step="0.01"
                    value={draftReward}
                    onChange={(e) => setDraftReward(e.target.value)}
                  />
                </label>
                {draftMode === "UNIQUE_CODES" ? (
                  <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:col-span-2">
                    Promoter wallet (base58) *
                    <input
                      className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                      value={draftPromoterWallet}
                      onChange={(e) => setDraftPromoterWallet(e.target.value)}
                      placeholder="e.g. 5MDU…WfNs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="text-[10px] normal-case tracking-normal text-white/45">
                      The promoter signs in at /promoter with this wallet to mint codes.
                    </span>
                  </label>
                ) : null}
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void createCampaign()}
                  disabled={pendingId === "new"}
                  className="pt-cta-gold rounded-full px-5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-60"
                >
                  {pendingId === "new" ? "Creating…" : "Create campaign"}
                </button>
              </div>
            </article>

            {error ? (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            {loading ? (
              <p className="pt-glass rounded-2xl p-6 text-sm text-white/70">Loading…</p>
            ) : campaigns.length === 0 ? (
              <p className="pt-glass rounded-2xl p-6 text-sm text-white/70">
                No campaigns yet. Create one above to share a public invite link.
              </p>
            ) : (
              <div className="space-y-4">
                {campaigns.map((c) => {
                  const reward = formatPbtcFromLamports(c.rewardLamports);
                  const ended = nowMs > 0 && new Date(c.endsAt).getTime() < nowMs;
                  const exhausted = c.claimsUsed >= c.maxClaims;
                  const isLive = !c.paused && !ended && !exhausted;
                  const isUnique = c.mode === "UNIQUE_CODES";
                  const claimedLabel = isUnique
                    ? `${c.claimsUsed} / ${c.maxClaims} codes minted`
                    : `${c.claimsUsed} / ${c.maxClaims} claimed`;
                  return (
                    <article
                      key={c.id}
                      className="pt-glass overflow-hidden rounded-3xl border border-white/5"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="pt-serif text-base font-semibold text-white">
                              {c.label}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${
                                isUnique
                                  ? "border border-[#7C3AED]/45 bg-[#7C3AED]/15 text-[#DDD6FE]"
                                  : "border border-white/15 bg-black/40 text-white/60"
                              }`}
                            >
                              {isUnique ? "Unique codes" : "Public link"}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-white/55">
                            Created {new Date(c.createdAt).toLocaleString()} · Ends{" "}
                            {new Date(c.endsAt).toLocaleString()}
                          </p>
                          <p className="pt-ref-mono mt-2 break-all text-[11px] text-white/65">
                            {isUnique ? `/promoter (wallet-gated)` : `/invite/${c.slug}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                              isLive
                                ? "border border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                                : c.paused
                                  ? "border border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE68A]"
                                  : "border border-red-400/30 bg-red-500/10 text-red-200"
                            }`}
                          >
                            {isLive ? "Live" : c.paused ? "Paused" : ended ? "Ended" : "Exhausted"}
                          </span>
                          <span className="text-[11px] text-white/55">
                            {claimedLabel} · {reward} PBTC each
                          </span>
                        </div>
                      </header>

                      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
                        {isUnique ? (
                          <button
                            type="button"
                            onClick={() => void copyPromoterPortal()}
                            className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
                          >
                            Copy /promoter link
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void copyInvite(c.slug)}
                            className="rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
                          >
                            Copy invite link
                          </button>
                        )}
                        {c.paused ? (
                          <button
                            type="button"
                            onClick={() => void patch(c, "resume")}
                            disabled={pendingId === c.id}
                            className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25 disabled:opacity-60"
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void patch(c, "pause")}
                            disabled={pendingId === c.id}
                            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:bg-white/10 disabled:opacity-60"
                          >
                            Pause
                          </button>
                        )}
                        <ExtendInline campaign={c} onExtend={(d) => void patch(c, "extend", d)} pending={pendingId === c.id} />
                        <button
                          type="button"
                          onClick={() => void remove(c)}
                          disabled={pendingId === c.id}
                          className="rounded-full border border-red-400/35 bg-red-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>

                      {isUnique ? (
                        <PromoterWalletInline
                          campaign={c}
                          onSave={(wallet) => void updatePromoter(c, wallet)}
                          pending={pendingId === c.id}
                        />
                      ) : null}

                      {c.notes ? (
                        <p className="border-t border-white/5 px-6 py-3 text-[11px] text-white/55">
                          Notes: {c.notes}
                        </p>
                      ) : null}

                      {isUnique ? (
                        c.giftClaims.length > 0 ? (
                          <div className="border-t border-white/5 px-6 py-4">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                              Minted invite codes
                            </p>
                            <ul className="mt-2 space-y-1.5 text-[11px] text-white/70">
                              {c.giftClaims.slice(0, 12).map((g) => (
                                <li
                                  key={g.id}
                                  className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1.5 last:border-0"
                                >
                                  <span className="pt-ref-mono break-all text-white/80">
                                    {g.code}
                                  </span>
                                  <span className="text-white/55">
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
                                    {g.status}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="border-t border-white/5 px-6 py-3 text-[11px] text-white/45">
                            No invites minted yet — the promoter mints them at /promoter.
                          </p>
                        )
                      ) : c.claims.length > 0 ? (
                        <div className="border-t border-white/5 px-6 py-4">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                            Recent claims
                          </p>
                          <ul className="mt-2 space-y-1.5 text-[11px] text-white/70">
                            {c.claims.slice(0, 8).map((claim) => (
                              <li
                                key={claim.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1.5 last:border-0"
                              >
                                <span className="pt-ref-mono break-all text-white/80">
                                  {claim.recipientWallet.slice(0, 4)}…{claim.recipientWallet.slice(-4)}
                                </span>
                                <span className="text-white/55">
                                  {new Date(claim.claimedAt).toLocaleString()}
                                </span>
                                <span
                                  className={
                                    claim.status === "FULFILLED"
                                      ? "text-emerald-200"
                                      : claim.status === "FULFILLMENT_FAILED"
                                        ? "text-red-200"
                                        : "text-[#FDE68A]"
                                  }
                                >
                                  {claim.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function PromoterWalletInline({
  campaign,
  onSave,
  pending,
}: {
  campaign: Campaign;
  onSave: (wallet: string) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(campaign.promoterWallet ?? "");
  return (
    <div className="border-t border-white/5 bg-white/[0.02] px-6 py-3 text-[11px] text-white/65">
      <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
        Promoter wallet
      </span>
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Solana wallet (base58)"
            className="pt-input w-full max-w-md rounded-lg px-2 py-1.5 text-[11px] normal-case tracking-normal sm:w-auto"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => {
              if (!value.trim()) return;
              onSave(value.trim());
              setEditing(false);
            }}
            disabled={pending}
            className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-200 disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(campaign.promoterWallet ?? "");
              setEditing(false);
            }}
            className="text-[10px] uppercase tracking-widest text-white/55 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="pt-ref-mono break-all text-white/80">
            {campaign.promoterWallet ?? "(not set)"}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:bg-white/10"
          >
            {campaign.promoterWallet ? "Change" : "Set wallet"}
          </button>
        </div>
      )}
    </div>
  );
}

function ExtendInline({
  campaign,
  onExtend,
  pending,
}: {
  campaign: Campaign;
  onExtend: (endsAt: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(formatLocalDateInput(campaign.endsAt));
  return (
    <>
      {open ? (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pt-input rounded-xl px-2 py-1.5 text-[11px] normal-case tracking-normal"
          />
          <button
            type="button"
            onClick={() => {
              if (!value) return;
              onExtend(new Date(value).toISOString());
              setOpen(false);
            }}
            disabled={pending}
            className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-200 disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10px] uppercase tracking-widest text-white/55 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:bg-white/10"
        >
          Extend
        </button>
      )}
    </>
  );
}
