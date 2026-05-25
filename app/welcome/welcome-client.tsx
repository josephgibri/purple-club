"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ShieldCheck, Store, Tag } from "lucide-react";
import { useEffect, useRef } from "react";

import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { useMembershipGate } from "@/hooks/useMembershipGate";

/**
 * Cold-start onboarding page. The Purple Club window-sticker QR resolves
 * here, and so does any "Get started" link from the landing page.
 *
 * We auto-route a returning member straight to `/directory` once
 * verification + balance check clear, so a member re-scanning a sticker
 * doesn't see the onboarding wall again.
 *
 * The `merchant` and `via` query params are stashed in session storage
 * so we can attribute the eventual sign-up to the right sticker/source
 * later (no backend write yet — just the hook for it).
 */
export function WelcomeClient() {
  const searchParams = useSearchParams();
  const merchantId = searchParams.get("merchant");
  const via = searchParams.get("via");
  const { isMember } = useMembershipGate();
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (merchantId) {
      try {
        sessionStorage.setItem("pc_attrib_merchant", merchantId);
      } catch {
        // sessionStorage can throw in private mode; safe to ignore.
      }
    }
    if (via) {
      try {
        sessionStorage.setItem("pc_attrib_via", via);
      } catch {
        // Ignore.
      }
    }
  }, [merchantId, via]);

  useEffect(() => {
    if (!isMember || navigatedRef.current) return;
    navigatedRef.current = true;
    // Drop the visitor into the merchant they came in for, if any.
    if (merchantId) {
      router.push(`/directory?merchant=${encodeURIComponent(merchantId)}`);
    } else {
      router.push("/directory");
    }
  }, [isMember, merchantId, router]);

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-2xl flex-col px-5 py-10 sm:py-14">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-[-120px] h-[360px] w-[360px] rounded-full bg-gold-accent/10 blur-3xl" />

      <header className="relative flex items-center gap-3">
        <Image
          src="/purple-club-icon.png"
          alt="Purple Bitcoin"
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl border border-gold-accent/30 bg-black/30 p-1"
        />
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-accent/40 bg-gold-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-accent">
            <Tag size={10} />
            {via === "sticker" ? "Scanned from window sticker" : "Welcome"}
          </span>
          <p className="mt-1 text-base font-semibold uppercase tracking-[0.24em] text-gold-accent">
            Purple Club
          </p>
        </div>
      </header>

      <section className="relative mt-6 rounded-3xl border border-gold-accent/30 bg-surface p-7 shadow-2xl shadow-black/30 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Members-only discounts,
          <br />
          unlocked by holding{" "}
          <span className="bg-gradient-to-b from-[#FDE047] via-[#EAB308] to-[#B45309] bg-clip-text text-transparent">
            1 PBTC.
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-violet-100/75 sm:text-base">
          Purple Club is a private discount network for the Purple Bitcoin
          community on Solana. Hold at least <strong className="text-gold-accent">1 PBTC</strong>{" "}
          in your wallet and the directory unlocks — promo codes online,
          live pass at the counter in person.
        </p>

        {merchantId ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100">
            <Store size={12} />
            We&apos;ll drop you at this merchant the moment you&apos;re in.
          </div>
        ) : null}

        <div className="mt-7">
          <OnboardingSteps />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-violet-100/65">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} />
            Read-only verification · Your PBTC never leaves your wallet
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1 uppercase tracking-[0.18em] hover:text-violet-100"
          >
            About Purple Club
            <ArrowRight size={12} />
          </Link>
        </div>
      </section>

      <p className="relative mt-6 text-center text-[11px] uppercase tracking-[0.22em] text-violet-100/45">
        Need help? Reply to your invite email or DM @purpleclubhq on Telegram.
      </p>
    </main>
  );
}
