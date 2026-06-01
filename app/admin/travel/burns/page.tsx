"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWalletSession } from "@/hooks/useWalletSession";

const PBTC_DECIMALS = 9;
const ONE_PBTC_LAMPORTS = 10n ** BigInt(PBTC_DECIMALS);
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type BurnEvent = {
  id: string;
  kind: "GENESIS" | "MONTHLY";
  periodLabel: string;
  fulfilledStaysCount: number | null;
  usdSpent: string | null;
  pbtcLamportsBurned: string;
  txSignature: string | null;
  txSignatures: string[] | null;
  note: string | null;
  committedAt: string;
  committedBy: string | null;
};

type SuggestedResponse = {
  periodLabel: string;
  fulfilledStaysCount: number;
  revenueUsd: string;
  suggestedBurnUsd: string;
  alreadyBurned: { id: string; periodLabel: string; committedAt: string } | null;
};

type VerifyResponse =
  | {
      ok: true;
      signature: string;
      mint: string;
      lamportsBurned: string;
      slot: number;
      blockTime: number | null;
    }
  | { ok: false; reason: string };

function formatPbtc(lamports: string | bigint, fractionDigits = 4): string {
  let n: bigint;
  try {
    n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  } catch {
    return "0";
  }
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / ONE_PBTC_LAMPORTS;
  const frac = abs % ONE_PBTC_LAMPORTS;
  const wholeStr = whole.toLocaleString("en-US");
  if (fractionDigits <= 0) return `${negative ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(PBTC_DECIMALS, "0").slice(0, fractionDigits);
  if (/^0+$/.test(fracStr)) return `${negative ? "-" : ""}${wholeStr}`;
  return `${negative ? "-" : ""}${wholeStr}.${fracStr.replace(/0+$/, "") || "0"}`;
}

function shortSig(sig: string | null | undefined): string {
  if (!sig) return "—";
  if (sig.length <= 14) return sig;
  return `${sig.slice(0, 6)}…${sig.slice(-4)}`;
}

function formatPeriodLabel(label: string): string {
  if (label === "GENESIS") return "Genesis";
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) return label;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function lastCompletedMonthLabel(now: Date = new Date()): string {
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isWithinEditWindow(committedAt: string): boolean {
  return Date.now() - new Date(committedAt).getTime() <= EDIT_WINDOW_MS;
}

export default function AdminBurnsPage() {
  const session = useWalletSession();

  const [events, setEvents] = useState<BurnEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [suggested, setSuggested] = useState<SuggestedResponse | null>(null);
  const [suggestedLoading, setSuggestedLoading] = useState(false);

  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [skipVerification, setSkipVerification] = useState(false);

  const [period, setPeriod] = useState(lastCompletedMonthLabel());
  const [stays, setStays] = useState("");
  const [usdSpent, setUsdSpent] = useState("");
  const [pbtcAmount, setPbtcAmount] = useState("");
  const [txSig, setTxSig] = useState("");
  const [note, setNote] = useState("");

  const [genesisAmount, setGenesisAmount] = useState("12313");
  const [genesisSigs, setGenesisSigs] = useState("");
  const [genesisNote, setGenesisNote] = useState("Pre-launch booking burns.");
  const [genesisPending, setGenesisPending] = useState(false);

  const hasGenesis = useMemo(() => events.some((e) => e.kind === "GENESIS"), [events]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const res = await fetch("/api/travel/admin/burns/events", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load events.");
      setEvents((data.events ?? []) as BurnEvent[]);
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : "Could not load events.");
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadSuggested = useCallback(
    async (periodLabel: string) => {
      setSuggestedLoading(true);
      try {
        const res = await fetch(
          `/api/travel/admin/burns/suggested?period=${encodeURIComponent(periodLabel)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load stats.");
        setSuggested(data as SuggestedResponse);
      } catch (e) {
        setSuggested(null);
        if (e instanceof Error) toast.error(e.message);
      } finally {
        setSuggestedLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session.authenticated || !session.isFounder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [session.authenticated, session.isFounder, loadEvents]);

  useEffect(() => {
    if (!session.authenticated || !session.isFounder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSuggested(period);
  }, [session.authenticated, session.isFounder, period, loadSuggested]);

  useEffect(() => {
    if (suggested && stays === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStays(String(suggested.fulfilledStaysCount));
    }
  }, [suggested, stays]);

  async function verifyTx() {
    if (!txSig.trim()) {
      toast.error("Paste the burn transaction signature first.");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/travel/admin/burns/verify-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: txSig.trim() }),
      });
      const data = (await res.json()) as VerifyResponse | { error: string };
      if (!res.ok && "error" in data) {
        throw new Error(data.error);
      }
      const result = data as VerifyResponse;
      setVerifyResult(result);
      if (result.ok && !pbtcAmount) {
        setPbtcAmount(formatPbtc(result.lamportsBurned, 9));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function commitMonthly(event: FormEvent) {
    event.preventDefault();
    if (!period.trim() || !pbtcAmount.trim() || !txSig.trim()) {
      toast.error("Period, PBTC amount, and tx signature are all required.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/travel/admin/burns/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "MONTHLY",
          periodLabel: period.trim(),
          pbtcAmount: pbtcAmount.trim(),
          fulfilledStaysCount: stays ? Number(stays) : null,
          usdSpent: usdSpent || null,
          txSignature: txSig.trim(),
          note: note.trim() || null,
          skipVerification,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not commit burn.");
      toast.success(`Burn committed for ${formatPeriodLabel(period)}.`);
      setStays("");
      setUsdSpent("");
      setPbtcAmount("");
      setTxSig("");
      setNote("");
      setVerifyResult(null);
      setSkipVerification(false);
      setPeriod(lastCompletedMonthLabel());
      await Promise.all([loadEvents(), loadSuggested(lastCompletedMonthLabel())]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not commit burn.");
    } finally {
      setPending(false);
    }
  }

  async function commitGenesis(event: FormEvent) {
    event.preventDefault();
    if (!genesisAmount.trim()) {
      toast.error("Enter the pre-launch PBTC amount.");
      return;
    }
    setGenesisPending(true);
    try {
      const sigs = genesisSigs
        .split(/[\n,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/travel/admin/burns/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "GENESIS",
          periodLabel: "GENESIS",
          pbtcAmount: genesisAmount.trim(),
          txSignatures: sigs,
          note: genesisNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not seed genesis.");
      toast.success(
        `Genesis seeded · ${formatPbtc(data.event.pbtcLamportsBurned)} PBTC recorded.`,
      );
      await loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not seed genesis.");
    } finally {
      setGenesisPending(false);
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this burn event? Only possible within 24h of commit.")) return;
    try {
      const res = await fetch(`/api/travel/admin/burns/events/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete.");
      toast.success("Burn event deleted.");
      await loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
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

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
              Concierge · Burn Manager
            </span>
            <h1 className="pt-serif mt-2 text-4xl font-semibold text-white sm:text-5xl">
              Booking Burns
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              Each month: buy PBTC, burn on-chain, paste the tx hash here. Public ledger lives at{" "}
              <Link href="/burn" className="text-[#FDE68A] hover:underline">
                /burn
              </Link>
              .
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
              href="/burn"
              target="_blank"
              className="rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
            >
              Public page ↗
            </Link>
          </div>
        </div>

        {gateMessage ? (
          <div className="pt-glass rounded-2xl p-6 text-sm text-white/70">{gateMessage}</div>
        ) : (
          <>
            {!hasGenesis && !eventsLoading ? (
              <article className="pt-glass-strong mb-8 rounded-2xl border border-[#EAB308]/30 p-6 sm:p-8">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#FDE68A]">
                  Setup · One-time
                </span>
                <h2 className="pt-serif mt-3 text-2xl font-semibold text-white">
                  Seed the booking-burn baseline
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-white/65">
                  Before this dashboard, Purple Club had already burned PBTC from earlier
                  bookings. Record that aggregate once and the monthly flow takes over from
                  there. This entry will appear at the bottom of the public history table.
                </p>

                <form onSubmit={commitGenesis} className="mt-5 grid gap-4">
                  <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                    Pre-launch PBTC burned (aggregate)
                    <input
                      className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                      value={genesisAmount}
                      onChange={(e) => setGenesisAmount(e.target.value)}
                      placeholder="12313"
                      inputMode="decimal"
                      required
                    />
                  </label>

                  <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                    Tx signatures (optional · one per line)
                    <textarea
                      className="pt-input min-h-[88px] rounded-xl px-3 py-2 font-mono text-xs normal-case tracking-normal"
                      value={genesisSigs}
                      onChange={(e) => setGenesisSigs(e.target.value)}
                      placeholder="5kT...j2x&#10;9pR...m4n"
                    />
                    <span className="text-[10px] normal-case tracking-normal text-white/45">
                      Leave blank to display as &quot;Aggregate&quot; on the public page.
                    </span>
                  </label>

                  <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                    Note (optional)
                    <input
                      className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                      value={genesisNote}
                      onChange={(e) => setGenesisNote(e.target.value)}
                    />
                  </label>

                  <div>
                    <button
                      type="submit"
                      disabled={genesisPending || !genesisAmount.trim()}
                      className="pt-cta-gold rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {genesisPending ? "Seeding…" : "Seed Genesis Entry"}
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            <article className="pt-glass-strong mb-8 rounded-2xl p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                    Last completed month
                  </p>
                  <h2 className="pt-serif mt-1 text-2xl font-semibold text-white">
                    {formatPeriodLabel(period)}
                  </h2>
                </div>
                {suggested?.alreadyBurned ? (
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    Already burned ·{" "}
                    {new Date(suggested.alreadyBurned.committedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatTile
                  eyebrow="Confirmed stays"
                  value={
                    suggestedLoading
                      ? "…"
                      : suggested
                        ? suggested.fulfilledStaysCount.toLocaleString("en-US")
                        : "—"
                  }
                />
                <StatTile
                  eyebrow="Total revenue"
                  value={
                    suggestedLoading
                      ? "…"
                      : suggested
                        ? `$${Number(suggested.revenueUsd).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"
                  }
                />
                <StatTile
                  eyebrow="Suggested 0.25% burn"
                  value={
                    suggestedLoading
                      ? "…"
                      : suggested
                        ? `~$${Number(suggested.suggestedBurnUsd).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"
                  }
                  sub="Hint only · enter what you actually burned"
                />
              </div>
            </article>

            <article className="pt-glass-strong mb-8 rounded-2xl p-6 sm:p-8">
              <h2 className="pt-serif text-2xl font-semibold text-white">New burn entry</h2>
              <p className="mt-1 text-xs text-white/55">
                Buy PBTC on Jupiter, burn it from your wallet, then record the tx hash here.
              </p>

              <form onSubmit={commitMonthly} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Period
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="2026-04"
                    pattern="\d{4}-\d{2}"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Stays counted
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={stays}
                    onChange={(e) => setStays(e.target.value)}
                    placeholder="12"
                    type="number"
                    min={0}
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  USD spent (private)
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={usdSpent}
                    onChange={(e) => setUsdSpent(e.target.value)}
                    placeholder="482.00"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                  />
                  <span className="text-[10px] normal-case tracking-normal text-white/45">
                    Stored privately — not shown on /burn.
                  </span>
                </label>

                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  PBTC burned
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={pbtcAmount}
                    onChange={(e) => setPbtcAmount(e.target.value)}
                    placeholder="25.00"
                    inputMode="decimal"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:col-span-2">
                  Tx signature
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="pt-input flex-1 rounded-xl px-3 py-2 font-mono text-xs normal-case tracking-normal"
                      value={txSig}
                      onChange={(e) => {
                        setTxSig(e.target.value);
                        setVerifyResult(null);
                      }}
                      placeholder="Solana burn tx signature"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => void verifyTx()}
                      disabled={verifying || !txSig.trim()}
                      className="rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20 disabled:opacity-60"
                    >
                      {verifying ? "Verifying…" : "Verify on-chain"}
                    </button>
                  </div>
                  {verifyResult ? (
                    verifyResult.ok ? (
                      <p className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-[11px] normal-case tracking-normal text-emerald-200">
                        Verified · burn of{" "}
                        <span className="font-semibold">
                          {formatPbtc(verifyResult.lamportsBurned)} PBTC
                        </span>{" "}
                        at slot {verifyResult.slot.toLocaleString("en-US")}
                      </p>
                    ) : (
                      <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] normal-case tracking-normal text-red-200">
                        Could not verify: {verifyResult.reason}
                        <label className="mt-2 flex items-center gap-2 text-white/75">
                          <input
                            type="checkbox"
                            checked={skipVerification}
                            onChange={(e) => setSkipVerification(e.target.checked)}
                          />
                          Save anyway (override)
                        </label>
                      </div>
                    )
                  ) : null}
                </label>

                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:col-span-2">
                  Note (optional)
                  <input
                    className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      !pbtcAmount.trim() ||
                      !txSig.trim() ||
                      (verifyResult?.ok === false && !skipVerification)
                    }
                    className="pt-cta-gold rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Committing…" : "Commit Burn"}
                  </button>
                  <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Editable for 24h after commit
                  </span>
                </div>
              </form>
            </article>

            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="pt-serif text-2xl font-semibold text-white">Previous burns</h2>
                <button
                  type="button"
                  onClick={() => void loadEvents()}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/65 hover:text-white"
                >
                  Refresh
                </button>
              </div>

              {eventsError ? (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {eventsError}
                </p>
              ) : null}

              {eventsLoading && events.length === 0 ? (
                <p className="pt-glass rounded-2xl p-6 text-sm text-white/65">Loading…</p>
              ) : events.length === 0 ? (
                <p className="pt-glass rounded-2xl p-6 text-sm text-white/65">
                  No burns yet. Seed the genesis entry above to get started.
                </p>
              ) : (
                <div className="pt-glass overflow-hidden rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                        <tr>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Period</th>
                          <th className="px-4 py-3 font-medium">Stays</th>
                          <th className="px-4 py-3 text-right font-medium">USD</th>
                          <th className="px-4 py-3 text-right font-medium">PBTC</th>
                          <th className="px-4 py-3 font-medium">Tx</th>
                          <th className="px-4 py-3 font-medium">By</th>
                          <th className="px-4 py-3 font-medium" />
                        </tr>
                      </thead>
                      <tbody className="text-white/75">
                        {events.map((e) => (
                          <tr
                            key={e.id}
                            className={`border-t border-white/5 ${
                              e.kind === "GENESIS" ? "bg-black/20" : ""
                            }`}
                          >
                            <td className="px-4 py-3 text-white/80">
                              {e.kind === "GENESIS"
                                ? "—"
                                : new Date(e.committedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                            </td>
                            <td className="px-4 py-3 text-white">
                              {e.kind === "GENESIS" ? (
                                <span className="italic text-white/65">Genesis</span>
                              ) : (
                                formatPeriodLabel(e.periodLabel)
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-white/70">
                              {e.fulfilledStaysCount ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-white/70">
                              {e.usdSpent ? `$${e.usdSpent}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#FDE047]">
                              {formatPbtc(e.pbtcLamportsBurned)}
                            </td>
                            <td className="px-4 py-3">
                              {e.txSignature ? (
                                <a
                                  href={`https://solscan.io/tx/${e.txSignature}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="pt-ref-mono text-[#FDE68A] hover:underline"
                                >
                                  {shortSig(e.txSignature)}↗
                                </a>
                              ) : e.txSignatures && e.txSignatures.length > 0 ? (
                                <span className="text-white/65">
                                  {e.txSignatures.length} txs
                                </span>
                              ) : (
                                <span className="text-white/45">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-white/55">
                              {e.committedBy
                                ? `${e.committedBy.slice(0, 4)}…${e.committedBy.slice(-4)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {isWithinEditWindow(e.committedAt) ? (
                                <button
                                  type="button"
                                  onClick={() => void deleteEvent(e.id)}
                                  className="rounded-full border border-red-400/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-red-200 hover:bg-red-500/10"
                                >
                                  Delete
                                </button>
                              ) : (
                                <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                                  Locked
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
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
}: {
  eyebrow: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="pt-glass rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">{eyebrow}</p>
      <p className="pt-serif mt-1 text-xl font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-1 text-[10px] text-white/50">{sub}</p> : null}
    </div>
  );
}
