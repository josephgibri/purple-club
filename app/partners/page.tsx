import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Repeat, Store, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Become a Partner · Purple Club",
  description:
    "Reach holders who actually show up. List your business in front of verified PBTC members — you are not buying ad space, you are joining a community.",
};

const WHY = [
  {
    title: "Verified members, not anonymous traffic.",
    body: "Every member proves they hold PBTC on-chain. You reach committed people, not coupon hunters passing through.",
    icon: BadgeCheck,
  },
  {
    title: "Members come back.",
    body: "Ranks and standing give holders a reason to stay in the ecosystem — and to keep spending with the partners who serve it.",
    icon: Repeat,
  },
  {
    title: "Hotels anchor the network.",
    body: "Wholesale travel keeps members active and saving. Your listing sits alongside an anchor people already use.",
    icon: Store,
  },
  {
    title: "You join a movement, not a marketplace.",
    body: "This isn't ad inventory. Partners become part of a community-owned network with a shared incentive to grow it.",
    icon: Users,
  },
];

const STEPS = [
  { step: "Apply", body: "Submit your business. Every listing is reviewed — there's no auto-approval." },
  { step: "Get vetted", body: "We confirm the details and place your listing in Perks & Benefits." },
  { step: "Reach members", body: "Share codes or links with holders who show up and come back." },
];

export default function PartnersPage() {
  return (
    <main className="relative mx-auto w-full max-w-4xl px-6 pb-24 pt-16 sm:pt-24">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gold-accent/10 blur-3xl" />

      <header className="relative text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-gold-accent">
          For merchants · Purple Club Partners
        </p>
        <h1 className="pc-serif mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
          Reach holders who actually show up.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-violet-100/70">
          Verified PBTC holders — not random visitors, not Groupon hunters. You
          are not buying ad space. You are joining a community.
        </p>
        <div className="mt-7">
          <Link
            href="/join"
            className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_60px_-15px_rgba(246,196,83,0.65)] transition hover:brightness-110"
          >
            Apply to become a Partner
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <section className="relative mt-16">
        <h2 className="pc-serif text-center text-2xl font-semibold text-white sm:text-3xl">
          Business value, movement framing.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHY.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gold-accent/40 bg-gold-accent/10 text-gold-accent">
                  <Icon size={16} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-violet-100/75">{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="relative mt-16 rounded-3xl border border-gold-accent/30 bg-gold-accent/[0.06] p-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-gold-accent">
          Founding Partners · first 25 merchants
        </p>
        <h2 className="pc-serif mt-3 text-2xl font-semibold text-white sm:text-3xl">
          Listed forever. Credited at every IRL event.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-violet-100/75">
          A permanent Perks badge, featured placement at launch, a direct
          onboarding line, and credit at in-person events. This cohort closes —
          there is no second founding wave.
        </p>
      </section>

      <section className="relative mt-16">
        <h2 className="pc-serif text-center text-2xl font-semibold text-white sm:text-3xl">
          Three steps to the directory.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((item, index) => (
            <div
              key={item.step}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
              <span className="pc-serif text-2xl text-gold-accent/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-lg font-semibold text-white">{item.step}</p>
              <p className="mt-1 text-sm leading-relaxed text-violet-100/70">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-16 text-center">
        <p className="pc-serif mx-auto max-w-2xl text-2xl font-semibold leading-snug text-white sm:text-3xl">
          You are not buying ad space. You are joining a community of holders.
        </p>
        <div className="mt-7">
          <Link
            href="/join"
            className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
          >
            Apply to become a Partner
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </main>
  );
}
