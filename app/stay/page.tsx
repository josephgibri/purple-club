import type { Metadata } from "next";
import { BedDouble, Globe2, Percent, Sparkles } from "lucide-react";

import { ProductGate } from "@/components/access/product-gate";

export const metadata: Metadata = {
  title: "Hotels · Purple Club",
  description:
    "Purple Hotels — wholesale travel rates for PBTC holders. Save 20–40% across 250K+ hotels. Porting into Purple Club now.",
};

export default function HotelsPage() {
  return (
    <ProductGate
      eyebrow="Member Access"
      connectTitle="Sign in to unlock Hotels"
      connectDescription="Purple Hotels gives PBTC holders wholesale travel rates across 250K+ properties. Connect a wallet that holds at least 1 PBTC to access it — verification is read-only."
      explainer={<HotelsExplainer />}
    >
      <HotelsComingSoon />
    </ProductGate>
  );
}

function HotelsExplainer() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-7 text-center backdrop-blur-xl">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-accent/40 bg-purple-accent/15 text-[#DDD6FE]">
        <BedDouble size={22} />
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        Purple Hotels
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-violet-100/75">
        Wholesale travel rates, unlocked by holding PBTC. Save 20–40% on the
        same room you would book anywhere else — your bag pays for the trip.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Feature icon={<Percent size={16} />} label="20–40% off" body="Below public rates" />
        <Feature icon={<Globe2 size={16} />} label="250K+ hotels" body="Worldwide coverage" />
        <Feature icon={<Sparkles size={16} />} label="No fees" body="Holding is the perk" />
      </div>
    </div>
  );
}

function HotelsComingSoon() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full rounded-3xl border border-purple-accent/40 bg-surface p-8 shadow-2xl shadow-black/30">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-accent/40 bg-purple-accent/15 text-[#DDD6FE]">
          <BedDouble size={24} />
        </div>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-accent">
          Hotels
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Booking lands here soon.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-violet-100/75">
          You&apos;re verified and in the club. Purple Hotels is being ported
          into Purple Club right now — wholesale rooms, member pricing, and your
          bookings will all live on this page. Hang tight.
        </p>
      </div>
    </main>
  );
}

function Feature({
  icon,
  label,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-purple-accent/40 bg-purple-accent/15 text-[#DDD6FE]">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-white">{label}</p>
      <p className="text-xs text-violet-100/65">{body}</p>
    </div>
  );
}
