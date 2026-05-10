"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronDown, KeyRound, LogOut, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

function shorten(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function PurpleClubAuthButton() {
  return <AuthButtonInner />;
}

function AuthButtonInner() {
  const { publicKey, connected, disconnect } = useWallet();
  const { isVerified, clear } = useWalletAuth();
  const { enter, isPending, error } = useWalletSignIn();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleDisconnect() {
    try {
      clear();
      await disconnect();
    } finally {
      setMenuOpen(false);
    }
  }

  async function handleReSign() {
    setMenuOpen(false);
    await enter();
  }

  if (connected && publicKey && isVerified) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <ShieldCheck size={14} className="text-emerald-300" />
          <span className="font-mono text-[11px] tracking-wider text-emerald-50">
            {shorten(publicKey.toBase58())}
          </span>
          <ChevronDown size={12} className="opacity-70" />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#120925]/95 p-1.5 text-sm shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={handleReSign}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-violet-100/90 hover:bg-white/10"
            >
              <RefreshCw size={14} />
              Re-verify ownership
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-200 hover:bg-rose-500/15"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (connected && publicKey && !isVerified) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void enter()}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          title={error ?? undefined}
        >
          <KeyRound size={14} />
          {isPending ? "Waiting for wallet…" : "Sign to Enter"}
        </button>
        <button
          type="button"
          onClick={() => void disconnect()}
          className="rounded-full border border-white/10 bg-white/5 p-2 text-violet-100/70 hover:bg-white/10"
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void enter()}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full border border-gold-accent/60 bg-gradient-to-b from-[#1a0d33] to-[#120925] px-4 py-2 text-xs font-semibold text-gold-accent shadow-[0_0_18px_-6px_rgba(234,179,8,0.5)] transition hover:from-[#221042] hover:to-[#17102e] disabled:opacity-60"
      title={error ?? undefined}
    >
      <Sparkles size={14} />
      {isPending ? "Connecting…" : "Enter Purple Prime"}
    </button>
  );
}
