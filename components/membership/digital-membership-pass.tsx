"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { Portal } from "@/components/auth/portal";
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
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-4">
        <div className="scanline-overlay pointer-events-none absolute inset-0" />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Purple Club digital membership pass"
          className="relative my-auto w-full max-w-sm rounded-3xl border border-violet-300/25 bg-[#0d0720] p-3 shadow-2xl shadow-violet-950/60 sm:p-4"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200/20 bg-black/35 text-white"
            aria-label="Close membership pass"
          >
            <X size={18} />
          </button>

          <MembershipPassCard
            enabled={isOpen}
            walletAddress={walletAddress}
            pbtcBalance={pbtcBalance}
            signaturePrefix={signaturePrefix}
            signedAtIso={signedAtIso}
            variant="modal"
          />

          <Link
            href="/pass"
            onClick={close}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gold-accent/40 bg-black/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-accent hover:bg-black/35"
          >
            Open Full-Screen Pass
          </Link>
        </div>
      </div>
    </Portal>
  );
}
