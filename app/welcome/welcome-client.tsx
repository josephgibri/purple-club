"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { DogMark } from "@/components/brand/dog-mark";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { useMembershipGate } from "@/hooks/useMembershipGate";

/**
 * Cold-start onboarding. The window-sticker QR resolves here.
 * A member who already holds the key is sent to Places.
 * `merchant` and `via` are stashed so a later sign-up can be attributed.
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
    if (merchantId) {
      router.push(`/places?merchant=${encodeURIComponent(merchantId)}`);
    } else {
      router.push("/places");
    }
  }, [isMember, merchantId, router]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-6 py-10 sm:py-14">
      <DogMark size={72} />
      <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
        {via === "sticker" ? "From a sticker" : "Join"}
      </p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)] sm:text-5xl">Hold the key</h1>
      <p className="mt-3 max-w-md text-sm text-[var(--bone-dim)]">
        Hold 1 PBTC. That is the key. The club reads the balance. It never holds the tokens.
      </p>
      {merchantId ? (
        <p className="mt-4 text-sm text-[var(--bone)]">
          This sticker names a place. Once you hold the key, it opens there.
        </p>
      ) : null}
      <div className="mt-8">
        <OnboardingSteps />
      </div>
    </main>
  );
}
