import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { FOUNDER_NOTE, MANIFESTO_BELIEFS } from "@/lib/manifesto";

export const metadata: Metadata = {
  title: "Manifesto · Purple Club",
  description:
    "What we believe: the convictions behind a community-owned network for PBTC holders.",
};

export default function ManifestoPage() {
  return (
    <main className="relative mx-auto w-full max-w-3xl px-6 pb-20 pt-16 sm:pt-24">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />

      <header className="relative text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-gold-accent">
          Purple Club
        </p>
        <h1 className="pc-serif mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
          This is what we believe.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-violet-100/70">
          No marketing chrome. No promises of returns. Just the convictions
          behind a community-owned network for PBTC holders.
        </p>
      </header>

      <ol className="relative mt-14 space-y-10">
        {MANIFESTO_BELIEFS.map((belief, index) => (
          <li key={belief.heading} className="flex gap-5">
            <span className="pc-serif shrink-0 text-2xl font-semibold text-gold-accent/80">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-white">{belief.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-violet-100/75">
                {belief.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section className="relative mt-16 rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl">
        <h2 className="pc-serif text-2xl font-semibold text-white">
          {FOUNDER_NOTE.heading}
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-violet-100/75">
          {FOUNDER_NOTE.body.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </div>
      </section>

      <footer className="relative mt-12 text-center">
        <p className="text-sm italic text-violet-100/60">
          The ecosystem works when the community makes it work.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.2em]">
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 text-gold-accent hover:brightness-110"
          >
            Join the Club
            <ArrowRight size={12} />
          </Link>
          <Link
            href="/partners"
            className="inline-flex items-center gap-1.5 text-violet-100/60 hover:text-violet-100/90"
          >
            Become a Partner
            <ArrowRight size={12} />
          </Link>
          <Link
            href="/investors"
            className="inline-flex items-center gap-1.5 text-violet-100/60 hover:text-violet-100/90"
          >
            Investor thesis
            <ArrowRight size={12} />
          </Link>
        </div>
      </footer>
    </main>
  );
}
