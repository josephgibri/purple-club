"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Menu, ScanLine, ShieldCheck, Sparkles, Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { PurpleClubAuthButton } from "@/components/auth/purple-club-auth-button";
import { useWalletAuth } from "@/hooks/useWalletAuth";

/**
 * Sticky top nav.
 *
 * Members get persistent "Directory" + "My Pass" entries once they're
 * signed in — the pass used to be buried behind an "Open Pass" button
 * inside a status pill on the home page, which made it feel like a
 * secondary feature even though it's literally the product they show
 * at the counter.
 *
 * The "Verify" link is always public — it's the merchant scanner and
 * shouldn't require any auth.
 */
export function TopNav() {
  const [open, setOpen] = useState(false);
  const { connected } = useWallet();
  const { isVerified } = useWalletAuth();
  const pathname = usePathname();
  const isAuthed = connected && isVerified;
  const isVerifyRoute = pathname === "/verify";
  const isAdmin = useIsAdmin();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0618]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-gold-accent shadow-[0_0_18px_rgba(246,196,83,0.65)]"
          />
          <span className="pc-serif text-lg font-semibold tracking-tight text-white">
            Purple Club
          </span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <NavLinks isAuthed={isAuthed} pathname={pathname} isAdmin={isAdmin} />
          {!isVerifyRoute ? <PurpleClubAuthButton /> : null}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 md:hidden"
          aria-label="Toggle mobile navigation"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-white/10 px-4 py-3 md:hidden">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            <NavLinks
              isAuthed={isAuthed}
              pathname={pathname}
              isAdmin={isAdmin}
              onNavigate={() => setOpen(false)}
              mobile
            />
            {!isVerifyRoute ? <PurpleClubAuthButton /> : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Lightweight session probe that only triggers a single GET on mount.
 * We don't put this in a global context because admin status is rare
 * and not worth dragging through the whole tree — the nav is the only
 * place that needs it today.
 */
function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { role?: string } } | null) => {
        if (cancelled) return;
        setIsAdmin(data?.user?.role === "ADMIN");
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isAdmin;
}

type NavLinksProps = {
  isAuthed: boolean;
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
};

function NavLinks({ isAuthed, pathname, isAdmin, onNavigate, mobile }: NavLinksProps) {
  const base = mobile
    ? "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm";

  function classFor(href: string, accent: "gold" | "emerald" | "violet" = "violet") {
    const active = pathname === href;
    const tones = {
      gold: active
        ? "text-gold-accent bg-gold-accent/10"
        : "text-violet-100/85 hover:bg-white/10",
      emerald: active
        ? "text-emerald-200 bg-emerald-500/15"
        : "text-violet-100/85 hover:bg-white/10",
      violet: active
        ? "text-white bg-white/10"
        : "text-violet-100/85 hover:bg-white/10",
    } as const;
    return `${base} ${tones[accent]}`;
  }

  return (
    <>
      {isAuthed ? (
        <>
          <Link href="/directory" onClick={onNavigate} className={classFor("/directory")}>
            <Store size={14} />
            Directory
          </Link>
          <Link href="/pass" onClick={onNavigate} className={classFor("/pass", "gold")}>
            <Sparkles size={14} />
            My Pass
          </Link>
        </>
      ) : null}
      <Link href="/verify" onClick={onNavigate} className={classFor("/verify", "emerald")}>
        <ScanLine size={14} />
        Verify
      </Link>
      <Link href="/join" onClick={onNavigate} className={classFor("/join")}>
        For Merchants
      </Link>
      {isAdmin ? (
        <Link
          href="/admin/reviews"
          onClick={onNavigate}
          className={
            mobile
              ? "flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-amber-100 transition hover:border-rose-300/70 hover:bg-rose-500/15"
              : "inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:border-rose-300/70 hover:bg-rose-500/15"
          }
          aria-label="Admin review queue"
        >
          <ShieldCheck size={14} />
          Admin
        </Link>
      ) : null}
    </>
  );
}
