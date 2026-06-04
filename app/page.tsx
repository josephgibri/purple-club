import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Crown,
  Flame,
  Landmark,
  Percent,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";

import { EnterClubCta } from "@/components/landing/enter-club-cta";
import { HolderStat } from "@/components/landing/holder-stat";
import { PbtcInfoButton } from "@/components/landing/pbtc-info-button";
import { BURN_SOURCES } from "@/lib/constants";
import { MANIFESTO_BELIEFS } from "@/lib/manifesto";
import { PURPLE_COURT } from "@/lib/ranks";

/**
 * Marketing homepage for the consolidated Purple Club.
 *
 * Positioning: membership you HOLD, not a fee you pay. The page leads with
 * belonging + benefits (the reason an everyday investor joins), then proves
 * the inverted model (you own the asset, the supply only shrinks, status is
 * earned), and reassures on trust (read-only, no fee).
 *
 * Intentionally NOT here:
 *   - Council — a closed group, never advertised to the public.
 *   - Surface deep-links — every product is gated, so non-members would
 *     just hit a wall. The benefit cards are a non-clickable showcase.
 *   - A "featured partners" peek — a thin public list reads as empty, not
 *     exclusive. Scarcity sells better than a short directory.
 */

const BENEFITS = [
  {
    name: "Hotels",
    icon: BedDouble,
    body: "Wholesale rates at 250K+ hotels — the kind usually reserved for travel agents. Save up to 20% on the same room.",
    pill: "Reserved for members",
  },
  {
    name: "Perks & Benefits",
    icon: Store,
    body: "A vetted circle of partners with member-only pricing. No coupon hunting — you're already on the list.",
    pill: "Vetted partners only",
  },
  {
    name: "Lend",
    icon: Landmark,
    body: "Need cash? Borrow USDC against your PBTC without selling it. Your bag stays yours. Live after an independent audit.",
    pill: "Liquidity without selling",
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-160px] h-[460px] w-[460px] rounded-full bg-[#4C1D95]/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-160px] top-28 h-[380px] w-[380px] rounded-full bg-gold-accent/10 blur-3xl" />

      {/* Hero */}
      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-white/65 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-accent" />
          Members only · By the asset you hold
        </span>

        <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
          Membership you hold.{" "}
          <span className="bg-gradient-to-b from-[#FDE047] via-[#EAB308] to-[#B45309] bg-clip-text text-transparent">
            Not a fee you pay.
          </span>
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-violet-100/75 sm:text-base">
          Purple Club is a members-only network for the everyday investor. Hold
          one scarce asset and you&apos;re in — wholesale travel, member-only
          perks, and liquidity against your holdings without ever selling. No
          annual fee. No subscription. The asset is yours, and the supply only
          gets rarer.
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

      {/* Benefits — non-clickable showcase (every surface is gated) */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <SectionLabel>What membership unlocks</SectionLabel>
        <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          A members-only world that pays you back.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-violet-100/70">
          One asset. Every door inside opens the moment you hold it — and most
          put real money back in your pocket.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.name}
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-accent/45 bg-purple-accent/15 text-[#DDD6FE]">
                  <Icon size={16} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{benefit.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-violet-100/70">
                  {benefit.body}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-accent">
                  {benefit.pill}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Why it's different — the inverted model */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <SectionLabel>Why it&apos;s different</SectionLabel>
        <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          The first club you join by holding, not paying.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Pillar
            accent="violet"
            icon={<Wallet size={16} />}
            label="You own it"
            title="The asset is the membership"
            body="No monthly fee, no subscription, ever. You hold one scarce asset — and it stays yours, in your wallet, the whole time."
          />
          <Pillar
            accent="gold"
            icon={<Flame size={16} />}
            label="It gets rarer"
            title="The supply only shrinks"
            body="PBTC is scarce by mechanism. Every booking and loan burns supply on-chain — so the longer you hold, the rarer your membership becomes."
          />
          <Pillar
            accent="emerald"
            icon={<Crown size={16} />}
            label="You earn standing"
            title="Status earned, not bought"
            body="Your rank in The Purple Court reflects what you hold — recognition you earn. Sign-in is read-only; your tokens never leave your wallet."
          />
        </div>
      </section>

      {/* The Burn */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="rounded-3xl border border-gold-accent/30 bg-gold-accent/[0.06] p-7 sm:p-9">
          <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.28em] text-gold-accent">
            <Flame size={14} />
            The Burn
          </div>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            The longer you hold, the rarer your membership.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-violet-100/70">
            PBTC is capped and deflationary by mechanism. Three independent,
            on-chain burn sources — supply only goes one way.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {BURN_SOURCES.map((source) => (
              <div
                key={source.label}
                className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center"
              >
                <p className="flex items-center justify-center gap-1.5 font-mono text-2xl font-semibold text-gold-accent">
                  <Percent size={16} className="opacity-60" />
                  {source.value}
                </p>
                <p className="mt-1 text-xs text-violet-100/65">{source.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/investors"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold-accent hover:brightness-110"
            >
              Read the full thesis
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* The Purple Court */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl sm:p-9">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <SectionLabel align="left">Member ranks</SectionLabel>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Climb The Purple Court.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-violet-100/70">
                Your standing reflects the PBTC you hold — status you earn, not
                buy. From Page to Sovereign, your rank is private to you.
              </p>
              <p className="mt-3 max-w-md text-[11px] leading-relaxed text-violet-100/45">
                Titles confer status, access, and recognition. They are never
                financial promises.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {PURPLE_COURT.map((tier) => (
                <li
                  key={tier.title}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
                >
                  <span className="text-white">{tier.title}</span>
                  <span className="font-mono text-violet-100/55">
                    {tier.min.toLocaleString()}+
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 rounded-xl border border-gold-accent/30 bg-gold-accent/10 px-3 py-2 text-xs">
                <span className="text-gold-accent">Sovereign</span>
                <span className="font-mono text-gold-accent/80">Founding</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Manifesto teaser */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <SectionLabel>What we believe</SectionLabel>
        <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          A movement, not a loyalty program.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {MANIFESTO_BELIEFS.slice(0, 3).map((belief, index) => (
            <article
              key={belief.heading}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
              <span className="pc-serif text-2xl text-gold-accent/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-base font-semibold text-white">{belief.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-violet-100/70">{belief.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/manifesto"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/70 hover:text-white"
          >
            Read the manifesto
            <ArrowRight size={12} />
          </Link>
        </div>
      </section>

      {/* Merchant teaser */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/partners"
            className="group relative overflow-hidden rounded-2xl border border-gold-accent/40 bg-gradient-to-br from-[#1a0c39] via-[#140a2d] to-[#0e0722] p-6 transition hover:border-gold-accent"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-accent">
              For merchants
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Reach holders who actually show up
            </h3>
            <p className="mt-2 max-w-md text-sm text-violet-100/75">
              Verified PBTC holders — not coupon hunters. Zero commission, a
              printable window sticker, and a community that comes back.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-accent">
              Become a Partner
              <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/join"
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition hover:border-emerald-400/40"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-300">
              Already decided?
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              List your business
            </h3>
            <p className="mt-2 max-w-md text-sm text-violet-100/75">
              Apply in minutes. Every listing is reviewed, then it goes live in
              Perks &amp; Benefits in front of members.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              <Store size={12} />
              Apply now
              <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      {/* Closing */}
      <section className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 text-center">
        <Sparkles size={20} className="mx-auto text-gold-accent" />
        <p className="pc-serif mt-4 text-2xl font-semibold leading-snug text-white sm:text-3xl">
          The door is open now. It won&apos;t always be this early.
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-violet-100/70">
          Hold one scarce asset. Unlock a members-only world. Join the founding
          cohort of a community-owned network.
        </p>
        <div className="mt-7 flex justify-center">
          <EnterClubCta redirectOnEnter />
        </div>
      </section>
    </main>
  );
}

function SectionLabel({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div
      className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/45 ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
      <span className="h-px w-8 bg-white/15" />
      {children}
      <span className="h-px w-8 bg-white/15" />
    </div>
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
