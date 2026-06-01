"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MembershipPill } from "@/components/membership-pill";

type RequestPayload = {
  requests?: Array<{ status: string }>;
};

type SessionState = {
  authenticated: boolean;
  wallet?: string;
  isMaintainer?: boolean;
  isAdmin?: boolean;
  isAgent?: boolean;
  isFounder?: boolean;
  isPromoter?: boolean;
  pbtcBalance?: number;
  pbtcEligible?: boolean;
};

export type PurpleHeaderProps = {
  showNav?: boolean;
  variant?: "solid" | "floating";
  autoPrompt?: boolean;
  onSessionChange?: (session: SessionState) => void;
};

export function PurpleHeader({
  showNav = true,
  variant = "solid",
  autoPrompt,
  onSessionChange,
}: PurpleHeaderProps) {
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [hasOfferReady, setHasOfferReady] = useState(false);

  const onSessionChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);

  const handlePillSession = useCallback((next: SessionState) => {
    setSession((prev) => {
      const same =
        prev.authenticated === next.authenticated &&
        prev.wallet === next.wallet &&
        prev.isMaintainer === next.isMaintainer &&
        prev.isAdmin === next.isAdmin &&
        prev.isAgent === next.isAgent &&
        prev.isFounder === next.isFounder &&
        prev.isPromoter === next.isPromoter &&
        prev.pbtcBalance === next.pbtcBalance &&
        prev.pbtcEligible === next.pbtcEligible;
      return same ? prev : next;
    });
    onSessionChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      if (!session.authenticated || !session.wallet) {
        setHasOfferReady(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/travel/requests?wallet=${encodeURIComponent(session.wallet)}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RequestPayload;
        const ready = Boolean(data.requests?.some((r) => r.status === "OFFER_READY"));
        if (!cancelled) setHasOfferReady(ready);
      } catch {
        if (!cancelled) setHasOfferReady(false);
      }
    }
    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [session.authenticated, session.wallet]);

  const headerClass =
    variant === "floating"
      ? "absolute inset-x-0 top-0 z-40"
      : "sticky top-0 z-40 border-b border-white/5 bg-[#0A051A]/75 backdrop-blur-xl";

  return (
    <header className={headerClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="group flex items-center">
            <span className="flex flex-col leading-tight">
              <span className="pt-serif text-sm font-semibold text-white">Purple Club</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Private Rate Concierge
              </span>
            </span>
          </Link>

          {showNav ? (
            <nav className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/65 sm:hidden">
              <Link
                href="/stay"
                className="relative inline-flex min-h-[36px] items-center rounded-full border border-white/10 px-3 py-2 transition hover:text-white"
              >
                Bookings
                {hasOfferReady ? (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#EAB308] shadow-[0_0_10px_rgba(234,179,8,0.8)]" />
                ) : null}
              </Link>
              {session.isPromoter ? (
                <Link
                  href="/promoter"
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#7C3AED]/35 bg-[#7C3AED]/10 px-3 py-2 text-[#DDD6FE] transition hover:text-white"
                >
                  Promoter
                </Link>
              ) : null}
              {session.isMaintainer ? (
                <Link
                  href="/admin/stay"
                  className="inline-flex min-h-[36px] items-center rounded-full border border-white/10 px-3 py-2 transition hover:text-white"
                >
                  Agent
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {showNav ? (
            <nav className="hidden items-center gap-5 text-xs font-medium uppercase tracking-widest text-white/60 sm:flex">
              <Link
                href="/stay"
                className="relative transition hover:text-white"
              >
                Bookings
                {hasOfferReady ? (
                  <span className="absolute -right-3 -top-1 h-2 w-2 rounded-full bg-[#EAB308] shadow-[0_0_10px_rgba(234,179,8,0.8)]" />
                ) : null}
              </Link>
              {session.isPromoter ? (
                <Link
                  href="/promoter"
                  className="text-[#DDD6FE] transition hover:text-white"
                >
                  Promoter
                </Link>
              ) : null}
              {session.isMaintainer ? (
                <Link href="/admin/stay" className="transition hover:text-white">
                  Agent
                </Link>
              ) : null}
            </nav>
          ) : null}

          <MembershipPill
            autoPrompt={autoPrompt}
            onSessionChange={handlePillSession}
            compactOnMobile
          />
        </div>
      </div>
    </header>
  );
}
