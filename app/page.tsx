import Link from "next/link";
import { ArrowRight, Coins, ScanLine, ShieldCheck, Sparkles, Store } from "lucide-react";

import { AnchorTeaser } from "@/components/landing/anchor-teaser";
import { EnterClubCta } from "@/components/landing/enter-club-cta";
import { HolderStat } from "@/components/landing/holder-stat";
import { PbtcInfoButton } from "@/components/landing/pbtc-info-button";

/**
 * Public landing page.
 *
 * Logged-out visitors land here, see the value prop, an anchor teaser
 * (names + logos only — no promo codes, no addresses), and the gold
 * "Enter Purple Club" CTA. After a successful wallet sign-in the CTA
 * pushes the holder to `/directory` (handled in EnterClubCta), so this
 * page is intentionally lean and never renders the directory itself.
 *
 * The old `/` was the directory page *and* the landing crammed together,
 * with the directory blurred for logged-out users. That blur made the
 * fold ~1000px of un-usable content. Split now mirrors the rest of the
 * ecosystem (purple-travel-app, purple-otc): focused landing → focused
 * authenticated app.
 */

export default function HomePage() {
  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-160px] h-[460px] w-[460px] rounded-full bg-[#4C1D95]/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-160px] top-28 h-[380px] w-[380px] rounded-full bg-gold-accent/10 blur-3xl" />

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-white/65 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-accent" />
          Member Access
        </span>

        <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
          Discounts you only get for{" "}
          <span className="bg-gradient-to-b from-[#FDE047] via-[#EAB308] to-[#B45309] bg-clip-text text-transparent">
            holding PBTC.
          </span>
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-violet-100/75 sm:text-base">
          Purple Club is a private discount network for the PBTC community.
          Hold at least <span className="font-semibold text-gold-accent">1 PBTC</span> in
          your Solana wallet to unlock exclusive offers from vetted online and
          local merchants. Verification is read-only — your tokens never leave
          your wallet.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <HolderStat />
          <PbtcInfoButton />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <EnterClubCta redirectOnEnter />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.22em]">
            <Link
              href="/welcome"
              className="inline-flex items-center gap-1.5 text-violet-100/55 hover:text-violet-100/80"
            >
              New to crypto? Walk-through
              <ArrowRight size={12} />
            </Link>
            <Link
              href="/join"
              className="inline-flex items-center gap-1.5 text-violet-100/55 hover:text-violet-100/80"
            >
              <Store size={12} />
              For Merchants
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
          <span className="h-px w-8 bg-white/15" />
          How it works
          <span className="h-px w-8 bg-white/15" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Pillar
            accent="violet"
            icon={<Coins size={16} />}
            label="Hold"
            title="Acquire 1 PBTC"
            body="Buy PBTC on Solana. That single token is your one-time membership stake — no monthly fee, no subscription, ever."
          />
          <Pillar
            accent="emerald"
            icon={<ShieldCheck size={16} />}
            label="Verify"
            title="Sign once, read-only"
            body="Connect Phantom or Solflare and sign a free message. We never request transaction or transfer permissions."
          />
          <Pillar
            accent="gold"
            icon={<Sparkles size={16} />}
            label="Save"
            title="Spend like an insider"
            body="Show your live pass at any Purple Hub or paste the promo code online. Anchors include Purple Stay, Purple OTC, and global retail partners."
          />
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-accent">
              Featured partners
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              A peek inside the network
            </h2>
            <p className="mt-1 max-w-xl text-sm text-violet-100/70">
              Sign in to see live promo codes, addresses, and the full
              directory. New merchants are added every week.
            </p>
          </div>
          <Link
            href="/directory"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/85 transition hover:border-gold-accent/40 hover:text-white"
          >
            See directory
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-5">
          <AnchorTeaser limit={3} />
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/join"
            className="group relative overflow-hidden rounded-2xl border border-gold-accent/40 bg-gradient-to-br from-[#1a0c39] via-[#140a2d] to-[#0e0722] p-6 transition hover:border-gold-accent"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-accent">
              For merchants
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Free exposure + a printable window sticker
            </h3>
            <p className="mt-2 max-w-md text-sm text-violet-100/75">
              Zero commission. We send qualified members straight to your shop —
              plus a Purple Club sticker for your window so passers-by can scan,
              get a wallet, and walk back in for the discount.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-accent">
              Join the network
              <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/verify"
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition hover:border-emerald-400/40"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-300">
              For staff
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Scan a member&apos;s pass
            </h3>
            <p className="mt-2 max-w-md text-sm text-violet-100/75">
              Open the verifier on any phone — no install, no account.
              Scan a Purple Club QR and get an instant on-chain yes/no.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              <ScanLine size={12} />
              Open verifier
              <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-violet-100/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-base font-semibold uppercase tracking-[0.28em] text-gold-accent">
              Purple Club
            </span>
            <span className="text-xs text-violet-100/55">
              Read-only Solana verification · Tokens never leave your wallet.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}

type PillarProps = {
  accent: "violet" | "emerald" | "gold";
  icon: React.ReactNode;
  label: string;
  title: string;
  body: string;
};

function Pillar({ accent, icon, label, title, body }: PillarProps) {
  const styles = {
    violet: {
      ring: "border-purple-accent/45 bg-purple-accent/15 text-[#DDD6FE]",
      glow: "bg-purple-accent/15",
      label: "text-[#DDD6FE]",
    },
    emerald: {
      ring: "border-emerald-400/45 bg-emerald-500/15 text-emerald-100",
      glow: "bg-emerald-500/15",
      label: "text-emerald-200",
    },
    gold: {
      ring: "border-gold-accent/45 bg-gold-accent/15 text-gold-accent",
      glow: "bg-gold-accent/15",
      label: "text-gold-accent",
    },
  }[accent];

  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl ${styles.glow}`} />
      <div className="relative">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${styles.ring}`}>
          {icon}
        </span>
        <p className={`mt-4 text-[10px] uppercase tracking-[0.28em] ${styles.label}`}>{label}</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-violet-100/70">{body}</p>
      </div>
    </article>
  );
}
