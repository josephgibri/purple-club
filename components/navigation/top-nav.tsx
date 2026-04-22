"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { WalletConnectButton } from "@/components/providers/solana-provider";

export function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0618]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/purple-club-icon.png"
            alt="Purple Club emblem"
            width={80}
            height={48}
            className="h-11 w-auto object-contain"
            priority
          />
          <span className="text-base font-semibold tracking-widest text-[#D4AF37]">
            PURPLE CLUB
          </span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <NavLinks />
          <WalletConnectButton />
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
            <NavLinks onNavigate={() => setOpen(false)} mobile />
            <WalletConnectButton />
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NavLinks(props: { onNavigate?: () => void; mobile?: boolean }) {
  const classes = props.mobile
    ? "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
    : "rounded-lg px-3 py-2 text-sm text-violet-100/85 hover:bg-white/10";

  return (
    <>
      <Link href="/#directory" className={classes} onClick={props.onNavigate}>
        Directory
      </Link>
      <Link href="/join" className={classes} onClick={props.onNavigate}>
        Join as Merchant
      </Link>
    </>
  );
}
