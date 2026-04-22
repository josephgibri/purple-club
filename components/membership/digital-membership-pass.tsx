"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DigitalMembershipPassProps = {
  isOpen: boolean;
  onClose: () => void;
  walletAddress?: string;
  pbtcBalance: number;
  signaturePrefix?: string | null;
  signedAtIso?: string | null;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatClock(now: Date): string {
  return now.toLocaleTimeString("en-GB", { hour12: false });
}

export function DigitalMembershipPass({
  isOpen,
  onClose,
  walletAddress,
  pbtcBalance,
  signaturePrefix,
  signedAtIso,
}: DigitalMembershipPassProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [showVerification, setShowVerification] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setShowVerification(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && dialogRef.current) {
        const nodes = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close]);

  const shortWallet = useMemo(() => {
    if (!walletAddress) return "Wallet connected";
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  const signedAtLabel = useMemo(() => {
    if (!signedAtIso) return null;
    try {
      return new Date(signedAtIso).toLocaleString();
    } catch {
      return signedAtIso;
    }
  }, [signedAtIso]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center">
      <div className="scanline-overlay pointer-events-none absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Purple Club digital membership pass"
        className="relative w-full max-w-md rounded-3xl border border-violet-300/25 bg-[#0d0720] p-5 pb-6 shadow-2xl shadow-violet-950/60 sm:p-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-200/20 bg-black/35 text-white"
          aria-label="Close membership pass"
        >
          <X size={22} />
        </button>

        <div className="relative mt-10 overflow-hidden rounded-3xl border border-gold-accent/35 bg-gradient-to-br from-[#1a0c39] via-[#2a1256] to-[#160a33] p-5">
          <div className="hologram-shimmer pointer-events-none absolute -inset-[35%]" />
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-[0.28em] text-gold-accent/90">
              Purple Club Pass
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Active Membership
            </h2>
            <p className="mt-1 text-xs text-violet-100/80">Verified Active</p>

            <div className="mt-6 rounded-2xl border border-violet-200/20 bg-black/25 p-4">
              <p className="text-xs text-violet-100/80">Live Verification Clock</p>
              <p className="font-mono text-4xl font-semibold tracking-wider text-gold-accent">
                {clock}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-violet-200/15 bg-black/20 p-3">
                <p className="text-xs text-violet-100/70">Wallet</p>
                <p className="mt-1 font-mono text-white">{shortWallet}</p>
              </div>
              <div className="rounded-xl border border-violet-200/15 bg-black/20 p-3">
                <p className="text-xs text-violet-100/70">PBTC Balance</p>
                <p className="mt-1 font-semibold text-white">
                  {pbtcBalance.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {signaturePrefix || signedAtLabel ? (
          <div className="mt-4 rounded-xl border border-violet-200/15 bg-black/25">
            <button
              type="button"
              onClick={() => setShowVerification((v) => !v)}
              aria-expanded={showVerification}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-violet-100/80 hover:text-white"
            >
              View Verification Details
              <span aria-hidden className="text-sm">
                {showVerification ? "−" : "+"}
              </span>
            </button>
            {showVerification ? (
              <div className="space-y-2 border-t border-violet-200/10 px-4 py-3 text-xs text-violet-100/80">
                {signaturePrefix ? (
                  <p>
                    <span className="text-violet-100/60">Signature:</span>{" "}
                    <span className="font-mono text-violet-100">
                      {signaturePrefix}
                    </span>
                  </p>
                ) : null}
                {signedAtLabel ? (
                  <p>
                    <span className="text-violet-100/60">Signed at:</span>{" "}
                    <span className="font-mono text-violet-100">
                      {signedAtLabel}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
