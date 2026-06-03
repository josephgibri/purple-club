"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import type { TokenSymbol } from "@/lib/purple-wallet/jupiter";

/** Token glyphs used across the Purple Wallet UI. */
export const TOKEN_ICONS: Record<TokenSymbol, string> = {
  SOL: "/tokens/sol.svg",
  USDC: "/tokens/usdc.svg",
  PBTC: "/purple-club-icon.svg",
};

function TokenChip({ token, size = 18 }: { token: TokenSymbol; size?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <Image
        src={TOKEN_ICONS[token]}
        alt=""
        width={size}
        height={size}
        className="rounded-full"
      />
      <span className="text-sm font-semibold text-white">{token}</span>
    </span>
  );
}

interface Props {
  value: TokenSymbol;
  options: TokenSymbol[];
  onChange: (token: TokenSymbol) => void;
}

/**
 * Custom token picker. Replaces the native <select>, whose option list
 * rendered white-on-white on Windows Chrome, and lets us show token logos
 * (which native <option> elements can't).
 */
export function TokenSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 hover:border-white/25 focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <TokenChip token={value} />
        <ChevronDown size={14} className="text-white/50" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-xl border border-white/10 bg-[#0A051A] p-1 shadow-2xl shadow-black/60"
        >
          {options.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === value}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 ${
                t === value ? "bg-white/5" : ""
              }`}
            >
              <TokenChip token={t} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
