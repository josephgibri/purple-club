"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { MembershipPassCard } from "@/components/membership/membership-pass-card";

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

/**
 * Modal wrapper around `MembershipPassCard`. The card is rendered with
 * `enabled={isOpen}` so the underlying pass-token mint and live clock
 * only run while the dialog is visible — closing the modal releases
 * the auto-refresh timer and stops the per-second re-render.
 */
export function DigitalMembershipPass({
  isOpen,
  onClose,
  walletAddress,
  pbtcBalance,
  signaturePrefix,
  signedAtIso,
}: DigitalMembershipPassProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

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
          className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-200/20 bg-black/35 text-white"
          aria-label="Close membership pass"
        >
          <X size={22} />
        </button>

        <div className="mt-10">
          <MembershipPassCard
            enabled={isOpen}
            walletAddress={walletAddress}
            pbtcBalance={pbtcBalance}
            signaturePrefix={signaturePrefix}
            signedAtIso={signedAtIso}
            variant="modal"
          />
        </div>

        <Link
          href="/pass"
          onClick={close}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-gold-accent/40 bg-black/25 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold-accent hover:bg-black/35"
        >
          Open Full-Screen Pass
        </Link>
      </div>
    </div>
  );
}
