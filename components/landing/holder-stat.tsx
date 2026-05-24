"use client";

import { Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePbtcHolders } from "@/hooks/usePbtcHolders";

const ANIMATION_MS = 1200;

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Slim holder-count pill rendered under the hero headline. Intentionally
 * different from `CommunityCounter` on /join — that one is merchant-pitched
 * ("Your Direct Audience"), this one is holder-facing social proof.
 */
export function HolderStat() {
  const { activeHolders, isLoading } = usePbtcHolders();
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeHolders === null) return;
    const target = activeHolders;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / ANIMATION_MS);
      setDisplay(Math.round(target * easeOutQuart(progress)));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [activeHolders]);

  if (isLoading || activeHolders === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-violet-100/60 backdrop-blur-md">
        <Users size={12} />
        Counting holders…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-100 backdrop-blur-md">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
      <strong className="font-mono font-semibold tabular-nums text-emerald-50">
        {display.toLocaleString()}
      </strong>
      <span className="text-emerald-100/80">PBTC holders worldwide</span>
    </span>
  );
}
