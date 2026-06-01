"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PurpleHeader } from "@/components/purple-header";
import { SaveBookBurnLoop } from "@/components/save-book-burn-loop";

const PBTC_DECIMALS = 9;
const ONE_PBTC_LAMPORTS = 10n ** BigInt(PBTC_DECIMALS);

function formatPbtc(lamports: string | bigint, fractionDigits = 2): string {
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

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

type SummaryResponse = {
  bookingBurnsLamports: string;
  bookingBurnsCount: number;
  lastMonthly: { periodLabel: string; committedAt: string } | null;
  totalBurnsLamports: string | null;
  decimals: number;
  fetchedAt: string;
};

type BurnEvent = {
  id: string;
  kind: "GENESIS" | "MONTHLY";
  periodLabel: string;
  fulfilledStaysCount: number | null;
  pbtcLamportsBurned: string;
  txSignature: string | null;
  txSignatures: string[] | null;
  note: string | null;
  committedAt: string;
};

type EventsResponse = {
  events: BurnEvent[];
  count: number;
};

export default function BurnPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [events, setEvents] = useState<BurnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sumRes, evRes] = await Promise.all([
          fetch("/api/burn/summary", { cache: "no-store" }),
          fetch("/api/burn/events", { cache: "no-store" }),
        ]);
        const sumData = (await sumRes.json()) as SummaryResponse;
        const evData = (await evRes.json()) as EventsResponse;
        if (cancelled) return;
        setSummary(sumData);
        setEvents(evData.events ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load burn data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthly = useMemo(() => events.filter((e) => e.kind === "MONTHLY"), [events]);
  const genesis = useMemo(() => events.filter((e) => e.kind === "GENESIS"), [events]);

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-40" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-160px] h-[460px] w-[460px] rounded-full bg-[#EAB308]/10 blur-3xl" />

      <PurpleHeader />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-12">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308]" />
            Proof of Stay
          </span>
          <h1 className="pt-serif mt-4 text-4xl font-semibold text-white sm:text-5xl">
            Every booking burns.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            We burn a minimum of 0.25% of every confirmed booking — with periodic boost burns
            up to 1%. Each burn is posted below with its on-chain transaction hash. Verify it
            yourself.
          </p>
        </div>

        <SaveBookBurnLoop variant="feature" className="mb-8" />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="pt-glass rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
              Booking Burns
            </p>
            <p className="mt-1 text-[10px] text-white/45">from Purple Club stays</p>
            <p className="pt-serif mt-4 text-3xl font-semibold tabular-nums text-[#FDE047] sm:text-4xl">
              {summary ? (
                <>
                  {formatPbtc(summary.bookingBurnsLamports)}{" "}
                  <span className="text-base text-[#FDE047]/70">PBTC</span>
                </>
              ) : (
                <span className="text-base text-white/45">{loading ? "Loading…" : "—"}</span>
              )}
            </p>
            <p className="mt-3 text-[11px] text-white/55">
              {summary
                ? summary.bookingBurnsCount === 0
                  ? "Genesis seeded · awaiting first monthly burn"
                  : `${summary.bookingBurnsCount} ${
                      summary.bookingBurnsCount === 1 ? "burn" : "burns"
                    }${
                      summary.lastMonthly
                        ? ` · last ${formatPeriodLabel(summary.lastMonthly.periodLabel)}`
                        : ""
                    }`
                : "—"}
            </p>
          </div>

          <div className="pt-glass rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
              Total Burns
            </p>
            <p className="mt-1 text-[10px] text-white/45">everything on-chain</p>
            <p className="pt-serif mt-4 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
              {summary?.totalBurnsLamports ? (
                <>
                  {formatPbtc(summary.totalBurnsLamports)}{" "}
                  <span className="text-base text-white/55">PBTC</span>
                </>
              ) : (
                <span className="text-base text-white/45">
                  {loading ? "Reading on-chain…" : "—"}
                </span>
              )}
            </p>
            <p className="mt-3 text-[11px] text-white/55">since mint launch · Solana mainnet</p>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <article className="pt-glass mt-10 rounded-2xl p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">How it works</p>
          <h2 className="pt-serif mt-2 text-2xl font-semibold text-white">
            One simple loop, posted on-chain.
          </h2>
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-white/70">
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 text-[10px] font-semibold text-[#FDE047]">
                1
              </span>
              You book a hotel through Purple Club at a wholesale rate.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 text-[10px] font-semibold text-[#FDE047]">
                2
              </span>
              Each month, we take at least 0.25% of revenue from confirmed stays — sometimes
              more during boost months — buy PBTC on Solana, and burn it.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 text-[10px] font-semibold text-[#FDE047]">
                3
              </span>
              Every burn is posted below with its on-chain transaction hash. Verify on Solscan.
            </li>
          </ol>
        </article>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">Burn history</p>
              <h2 className="pt-serif mt-1 text-2xl font-semibold text-white">Every burn, on chain</h2>
            </div>
            {summary?.fetchedAt ? (
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Updated {relativeTime(summary.fetchedAt)}
              </p>
            ) : null}
          </div>

          {loading ? (
            <p className="pt-glass rounded-2xl p-6 text-sm text-white/65">Loading history…</p>
          ) : events.length === 0 ? (
            <p className="pt-glass rounded-2xl p-6 text-sm text-white/65">
              No burns recorded yet. Check back after the first monthly settlement.
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
                      <th className="px-4 py-3 text-right font-medium">PBTC burned</th>
                      <th className="px-4 py-3 font-medium">On-chain</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/75">
                    {monthly.map((e) => (
                      <tr
                        key={e.id}
                        className="border-t border-white/5 transition hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 text-white/80">
                          {new Date(e.committedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {formatPeriodLabel(e.periodLabel)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-white/70">
                          {e.fulfilledStaysCount ?? "—"}
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
                              className="pt-ref-mono inline-flex items-center gap-1 text-[#FDE68A] hover:underline"
                            >
                              {shortSig(e.txSignature)}
                              <span aria-hidden>↗</span>
                            </a>
                          ) : (
                            <span className="text-white/45">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {genesis.map((e) => {
                      const sigs = e.txSignatures ?? [];
                      return (
                        <tr
                          key={e.id}
                          className="border-t border-dashed border-white/10 bg-black/20"
                        >
                          <td className="px-4 py-3 text-white/45">—</td>
                          <td className="px-4 py-3 text-white/65">
                            <span className="italic">Genesis</span>
                            <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
                              Pre-launch
                            </p>
                          </td>
                          <td className="px-4 py-3 text-white/45">—</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-white/85">
                            {formatPbtc(e.pbtcLamportsBurned)}
                          </td>
                          <td className="px-4 py-3">
                            {sigs.length === 1 ? (
                              <a
                                href={`https://solscan.io/tx/${sigs[0]}`}
                                target="_blank"
                                rel="noreferrer"
                                className="pt-ref-mono inline-flex items-center gap-1 text-[#FDE68A] hover:underline"
                              >
                                {shortSig(sigs[0])}
                                <span aria-hidden>↗</span>
                              </a>
                            ) : sigs.length > 1 ? (
                              <details className="group">
                                <summary className="cursor-pointer list-none text-[#FDE68A] hover:underline">
                                  {sigs.length} txs ↗
                                </summary>
                                <ul className="mt-2 space-y-1 text-[10px]">
                                  {sigs.map((s) => (
                                    <li key={s}>
                                      <a
                                        href={`https://solscan.io/tx/${s}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="pt-ref-mono text-[#FDE68A]/85 hover:underline"
                                      >
                                        {shortSig(s)}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <span className="text-white/45">Aggregate</span>
                            )}
                            {e.note ? (
                              <p className="mt-1 max-w-[280px] truncate text-[10px] text-white/50">
                                {e.note}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.22em] text-white/45">
          Solana mainnet · Mint{" "}
          <a
            href="https://solscan.io/token/HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p"
            target="_blank"
            rel="noreferrer"
            className="pt-ref-mono text-[#FDE68A]/85 hover:underline"
          >
            HfMb…bF5p
          </a>
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.18em]">
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-white/65 hover:text-white"
          >
            Home
          </Link>
          <Link
            href="/membership"
            className="rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 px-4 py-2 font-semibold text-[#FDE68A] hover:bg-[#EAB308]/20"
          >
            How to join
          </Link>
        </div>
      </section>
    </main>
  );
}
