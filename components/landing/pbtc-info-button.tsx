"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/swap/SOL-${PBTC_MINT}`;

/**
 * Lightweight "What is PBTC?" affordance pulled out of the legacy home page
 * so the new landing can drop it inline next to the holder counter without
 * dragging in the wallet hooks.
 *
 * The modal is portalled to `document.body` so it escapes the hero
 * section's stacking context. Without the portal, the modal's `z-50`
 * was trapped inside a parent `relative z-10` section and got painted
 * underneath later-DOM siblings (the "How it works" pillars) which
 * shared the same z-10 — visually merging them with the modal panel.
 */
export function PbtcInfoButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // Prevent background scroll while the modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const modal = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pbtc-info-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-gold-accent/40 bg-[#150a30] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 rounded-full p-1.5 text-violet-100/60 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-accent">
          What is PBTC?
        </p>
        <h2 id="pbtc-info-title" className="mt-2 text-xl font-semibold">
          The Solana token that opens the network.
        </h2>
        <ol className="mt-4 grid gap-3 text-sm text-violet-100/85">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
              1
            </span>
            <span>
              PBTC is a token on the Solana blockchain. Hold at least 1 PBTC
              and you&apos;re a Purple Club member.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
              2
            </span>
            <span>
              Connect a Solana wallet (Phantom, Solflare, etc.) and sign a
              free read-only message. We never request transaction or
              transfer permissions.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
              3
            </span>
            <span>
              The full directory of merchants and their promo codes
              unlocks. Use them online or in person — your tokens stay
              safely in your wallet.
            </span>
          </li>
        </ol>
        <a
          href={JUPITER_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
        >
          Buy PBTC on Jupiter
        </a>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-violet-100/75 backdrop-blur-md transition hover:border-white/20 hover:text-white"
      >
        <HelpCircle size={12} />
        What is PBTC?
      </button>

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
