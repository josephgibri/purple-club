"use client";

import { BedDouble, CircleUser, Landmark, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { PurpleClubAuthButton } from "@/components/auth/purple-club-auth-button";
import { DogMark } from "@/components/brand/dog-mark";
import { useWalletSession } from "@/hooks/useWalletSession";

const TABS = [
  { href: "/account", label: "You", icon: CircleUser },
  { href: "/places", label: "Places", icon: MapPin },
  { href: "/council", label: "Council", icon: Landmark },
  { href: "/stay", label: "Stays", icon: BedDouble },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fixed top bar. The bottom tabs exist only after the key is held,
 * and Home is not one of them.
 */
export function TopNav() {
  const pathname = usePathname();
  const session = useWalletSession();
  const isMember = Boolean(session.authenticated && session.pbtcEligible);
  const isVerifyRoute = pathname === "/verify";

  useEffect(() => {
    document.body.style.paddingBottom = isMember ? "4rem" : "0px";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [isMember]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-[var(--line)] bg-[var(--wall)]">
        <div className="mx-auto flex h-full w-full max-w-[1120px] items-center justify-between gap-3 px-4">
          <Link href={isMember ? "/account" : "/"} className="flex min-w-0 items-center gap-2.5">
            <DogMark size={28} />
            <span className="club-display text-[13px] leading-none tracking-[0.14em]">
              <span className="text-[var(--bone)]">Purple</span>{" "}
              <span className="text-[var(--ink)]">Club</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
              Live
            </span>
            {!isVerifyRoute ? <PurpleClubAuthButton /> : null}
          </div>
        </div>
      </header>

      {isMember ? (
      <nav
        aria-label="Club"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--wall)]"
      >
        <ul className="mx-auto grid h-16 w-full max-w-[1120px] grid-cols-4">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.14em] ${
                    active
                      ? "bg-[var(--wall-3)] text-[var(--bone)] shadow-[inset_0_2px_0_0_var(--ink)]"
                      : "text-[var(--bone-dim)]"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      ) : null}
    </>
  );
}
