import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Landmark, Lock, ShieldCheck, Wallet } from "lucide-react";


export const metadata: Metadata = {
  title: "Lend · Purple Club",
  description:
    "Purple Lend — borrow against your PBTC without selling. Coming soon, live after an independent security audit.",
};

/**
 * Public coming-soon explainer for Purple Lend. Lend is money-movement,
 * so the real app ships separately at lend.purpleclub.org only after an
 * independent audit. This page is intentionally ungated.
 */
export default function LendPage() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />

      <div className="relative w-full rounded-3xl border border-white/10 bg-surface/80 p-9 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold-accent/40 bg-gold-accent/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-accent">
          <Lock size={12} />
          Coming soon
        </span>

        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-accent/40 bg-purple-accent/15 text-[#DDD6FE]">
          <Landmark size={24} />
        </div>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Borrow against your bag.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-violet-100/75">
          Purple Lend will let holders borrow USDC against PBTC without selling
          — non-custodial, on Solana. Because Lend moves real money, it ships as
          a separate app and only goes live{" "}
          <span className="font-semibold text-gold-accent">
            after an independent security audit.
          </span>
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Point icon={<Wallet size={16} />} label="Non-custodial" body="Your keys, your PBTC" />
          <Point icon={<Landmark size={16} />} label="USDC liquidity" body="Without selling" />
          <Point icon={<ShieldCheck size={16} />} label="Audit-first" body="Live only post-audit" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
          >
            Back to my account
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}

function Point({
  icon,
  label,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-purple-accent/40 bg-purple-accent/15 text-[#DDD6FE]">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-white">{label}</p>
      <p className="text-xs text-violet-100/65">{body}</p>
    </div>
  );
}
