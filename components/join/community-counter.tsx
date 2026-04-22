"use client";

import { ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePbtcHolders } from "@/hooks/usePbtcHolders";

const ANIMATION_MS = 1400;

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function formatRelative(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function CommunityCounter() {
  const { activeHolders, isLoading, error, fetchedAt } = usePbtcHolders();
  const [displayCount, setDisplayCount] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeHolders === null) return;
    const target = activeHolders;
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = easeOutQuart(progress);
      setDisplayCount(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [activeHolders]);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-gold-accent/40 bg-gradient-to-br from-[#1a0c39] via-[#140a2d] to-[#0e0722] p-6 shadow-[0_0_40px_-20px_rgba(246,196,83,0.5)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-gold-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-10 h-60 w-60 rounded-full bg-purple-accent/20 blur-3xl"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-accent/40 bg-black/40">
            <Users className="text-gold-accent" size={26} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold-accent/90">
              Your Direct Audience
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              {isLoading ? (
                <span className="font-mono text-4xl font-semibold text-violet-100/40 sm:text-5xl">
                  ------
                </span>
              ) : error || activeHolders === null ? (
                <span className="text-2xl font-semibold text-violet-100/60">
                  Growing fast
                </span>
              ) : (
                <>
                  <span className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {displayCount.toLocaleString()}
                  </span>
                  <span className="text-sm text-violet-100/60">wallets</span>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-violet-100/70">
              Active PBTC holders worldwide, on Solana
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {!isLoading && !error ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              Live on-chain count
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-xs text-violet-100/55">
            <ShieldCheck size={12} />
            {fetchedAt ? `Verified ${formatRelative(Date.now() - fetchedAt)}` : "Read-only Solana RPC"}
          </span>
        </div>
      </div>

      <p className="relative mt-5 max-w-3xl text-sm leading-relaxed text-violet-100/80">
        Every one of these wallets has proven, on-chain skin in the game. List your
        business on Purple Club and get <strong className="text-gold-accent">direct, zero-commission exposure</strong>{" "}
        to a verified high-intent community actively searching for premium offers.
      </p>
    </section>
  );
}
