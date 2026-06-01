import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame, Landmark, Sparkles } from "lucide-react";

import { BURN_SOURCES, SOLSCAN_TOKEN_URL, SURFACE_URLS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Investor Thesis · Purple Club",
  description:
    "The strategic case for Purple Bitcoin: digital scarcity for the everyday investor. Three pillars — Purple Club, The Burn, and Purple Council — engineered as one mechanical system on Solana.",
};

const PILLARS = [
  {
    no: "01",
    kicker: "Utility",
    title: "Purple Club",
    tagline: "The reason holders join.",
    body: "Membership turns PBTC into something you use, not just something you bet on. Holders save real money on travel and partner perks — so demand is rooted in utility, not hype.",
    icon: Sparkles,
  },
  {
    no: "02",
    kicker: "Scarcity",
    title: "The Burn",
    tagline: "Why supply only goes one way.",
    body: "Every booking, every loan, and ongoing transaction volume burn PBTC on-chain. The more the ecosystem is used, the rarer PBTC becomes — mechanically, not by promise.",
    icon: Flame,
  },
  {
    no: "03",
    kicker: "Trust",
    title: "Purple Council",
    tagline: "Why the treasury can't disappear.",
    body: "An ownerless treasury governed by passed proposals. No founder or VC can extract it. That structural credibility is what lets non-crypto investors take the asset seriously.",
    icon: Landmark,
  },
];

const FLYWHEEL = [
  { step: "Club acquires", body: "Real savings bring users in for utility, not speculation." },
  { step: "Members stay", body: "Ranks and standing make leaving cost something social." },
  { step: "Burn compresses", body: "Every action burns supply on-chain, one direction only." },
  { step: "Council reinvests", body: "The ownerless treasury compounds back into the ecosystem." },
];

const MOATS = [
  { title: "The tribe.", body: "Communities can't be cloned. A network of holders who actually show up is the hardest moat to copy." },
  { title: "The ownerless treasury.", body: "It can't be drained, sued, or rugged like a founder-controlled treasury. Trust is structural." },
  { title: "The multi-source burn.", body: "Three independent burn sources compress supply even if any single product stays flat." },
];

export default function InvestorsPage() {
  return (
    <main className="relative mx-auto w-full max-w-4xl px-6 pb-24 pt-16 sm:pt-24">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />

      <header className="relative text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-gold-accent">
          Investor Thesis · Purple Bitcoin
        </p>
        <h1 className="pc-serif mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
          Digital scarcity for the everyday investor.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-violet-100/70">
          Bitcoin proved digital scarcity can be worth a trillion dollars — but
          it stayed institutional, slow, and distant. Purple Bitcoin rebuilds
          that thesis on Solana: consumer utility, mechanical deflation, and an
          ownerless treasury. Three pillars, one mechanical system, one tribe.
        </p>
      </header>

      <section className="relative mt-16">
        <h2 className="pc-serif text-center text-2xl font-semibold text-white sm:text-3xl">
          Three pillars. One mechanical system.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <article
                key={pillar.title}
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-accent/45 bg-purple-accent/15 text-[#DDD6FE]">
                    <Icon size={16} />
                  </span>
                  <span className="pc-serif text-2xl text-white/15">{pillar.no}</span>
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-gold-accent">
                  {pillar.kicker}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">{pillar.title}</h3>
                <p className="text-sm text-violet-100/60">{pillar.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-violet-100/75">
                  {pillar.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="relative mt-16 rounded-3xl border border-gold-accent/30 bg-gold-accent/[0.06] p-8">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-gold-accent">
          <Flame size={14} />
          The Burn
        </div>
        <h2 className="pc-serif mt-3 text-2xl font-semibold text-white sm:text-3xl">
          Three sources. One direction.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-violet-100/75">
          We monetize the secondary market other projects ignore: usage and
          transaction volume both feed an on-chain SPL burn. No fee dependency,
          three independent sources, one-way supply compression.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {BURN_SOURCES.map((source) => (
            <div
              key={source.label}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center"
            >
              <p className="font-mono text-2xl font-semibold text-gold-accent">
                {source.value}
              </p>
              <p className="mt-1 text-xs text-violet-100/65">{source.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-16">
        <h2 className="pc-serif text-center text-2xl font-semibold text-white sm:text-3xl">
          The flywheel.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLYWHEEL.map((item, index) => (
            <div
              key={item.step}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
            >
              <span className="pc-serif text-lg text-gold-accent/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm font-semibold text-white">{item.step}</p>
              <p className="mt-1 text-xs leading-relaxed text-violet-100/70">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-violet-100/60">
          Demand goes up, supply goes down, the tribe gets stronger. Repeat.
        </p>
      </section>

      <section className="relative mt-16">
        <h2 className="pc-serif text-center text-2xl font-semibold text-white sm:text-3xl">
          Why this lasts.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {MOATS.map((moat) => (
            <article
              key={moat.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
              <h3 className="text-lg font-semibold text-white">{moat.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-violet-100/75">{moat.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mt-16 rounded-3xl border border-white/10 bg-surface/80 p-8 text-center backdrop-blur-xl">
        <h2 className="pc-serif text-2xl font-semibold text-white sm:text-3xl">
          Read the treasury before you write the check.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-violet-100/75">
          Purple Bitcoin is digital scarcity for the everyday investor. Purple
          Club is the membership. Every action with PBTC feeds The Burn. Purple
          Council ensures the treasury can never be extracted.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href={SURFACE_URLS.council}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
          >
            Visit Purple Council
            <ArrowRight size={14} />
          </a>
          <a
            href={SOLSCAN_TOKEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-violet-100/85 transition hover:border-white/30 hover:text-white"
          >
            View token on Solscan
          </a>
        </div>
        <div className="mt-6">
          <Link
            href="/manifesto"
            className="text-xs uppercase tracking-[0.2em] text-violet-100/55 hover:text-violet-100/85"
          >
            Read the manifesto
          </Link>
        </div>
      </section>
    </main>
  );
}
