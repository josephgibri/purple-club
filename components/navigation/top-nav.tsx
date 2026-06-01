"use client";

import { BedDouble, CircleUser, Landmark, Menu, Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { PurpleClubAuthButton } from "@/components/auth/purple-club-auth-button";

/**
 * Sticky top nav for the consolidated Purple Club shell.
 *
 * Four product tabs are always visible — My Account, Hotels, Lend,
 * Perks & Benefits — and each route gates itself behind <ProductGate>,
 * so the header stays stable for logged-out and member visitors alike.
 *
 * Verify (the public merchant scanner) lives in the footer now, and the
 * membership pass is reached from inside My Account rather than a
 * dedicated header link.
 *
 * Elevated surfaces (concierge desk, Perks review queue, promoter portal,
 * founder consoles) are all reached from My Account — there's a single
 * wallet identity, so the header stays the same for everyone.
 */
export function TopNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isVerifyRoute = pathname === "/verify";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0618]/70 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 justify-self-start">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-gold-accent shadow-[0_0_18px_rgba(246,196,83,0.65)]"
          />
          <span className="pc-serif text-lg font-semibold tracking-tight text-white">
            Purple Club
          </span>
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center justify-center gap-1 md:flex"
        >
          <NavLinks pathname={pathname} />
        </nav>

        <div className="flex items-center justify-end gap-2 justify-self-end">
          {!isVerifyRoute ? (
            <div className="hidden md:block">
              <PurpleClubAuthButton />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 md:hidden"
            aria-label="Toggle mobile navigation"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 px-4 py-3 md:hidden">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            <NavLinks
              pathname={pathname}
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

type NavLinksProps = {
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
};

const PRODUCT_TABS = [
  { href: "/account", label: "My Account", icon: CircleUser },
  { href: "/stay", label: "Hotels", icon: BedDouble },
  { href: "/lend", label: "Lend", icon: Landmark },
  { href: "/perks", label: "Perks & Benefits", icon: Store },
] as const;

function NavLinks({ pathname, onNavigate, mobile }: NavLinksProps) {
  const base = mobile
    ? "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm";

  function classFor(href: string) {
    const active = pathname === href;
    return `${base} ${
      active ? "text-white bg-white/10" : "text-violet-100/85 hover:bg-white/10"
    }`;
  }

  return (
    <>
      {PRODUCT_TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={onNavigate}
            className={classFor(tab.href)}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
