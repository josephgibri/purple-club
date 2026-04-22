"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { CommunityCounter } from "@/components/join/community-counter";
import {
  MerchantForm,
  type MerchantFormResult,
} from "@/components/join/merchant-form";

export default function JoinPage() {
  const router = useRouter();

  function onSuccess(result: MerchantFormResult) {
    const params = new URLSearchParams({
      issue: result.issueUrl,
      edit: result.editUrl,
      merchant: result.merchantId,
    });
    router.push(`/merchant/submitted?${params.toString()}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
          Merchant Join
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Join the Purple Club Network
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-violet-100/75">
          Get free exposure to PBTC holders actively looking for premium offers.
          Purple Club sends qualified community members to trusted merchants.
        </p>

        <div className="mt-6">
          <CommunityCounter />
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-gold-accent">
              High-Value Community
            </h2>
            <p className="mt-2 text-sm text-violet-100/80">
              Direct exposure to the PBTC holder ecosystem on Solana.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-gold-accent">
              Zero Commission
            </h2>
            <p className="mt-2 text-sm text-violet-100/80">
              We take 0% of your sales. The value goes entirely toward building
              loyalty with our members.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-gold-accent">
              Global Prestige
            </h2>
            <p className="mt-2 text-sm text-violet-100/80">
              Feature your brand alongside our Anchor partners in a premium,
              gated environment.
            </p>
          </article>
        </section>

        <div className="mt-8">
          <MerchantForm mode="submit" onSuccess={onSuccess} />
        </div>

        <div className="mt-8 text-sm text-violet-100/70">
          <Link href="/" className="underline underline-offset-4">
            Back to Purple Club
          </Link>
        </div>
      </div>
    </main>
  );
}
