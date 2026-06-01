"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import { decodeHotelUrl } from "@/lib/url-decoder";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

const PBTC_DECIMALS = 9;

function formatPbtc(rawLamports: string) {
  const sign = rawLamports.startsWith("-") ? "-" : "";
  const digits = (sign ? rawLamports.slice(1) : rawLamports).replace(/^0+(?=\d)/, "");
  const padded = digits.padStart(PBTC_DECIMALS + 1, "0");
  const wholePart = padded.slice(0, padded.length - PBTC_DECIMALS);
  const fractionPart = padded.slice(padded.length - PBTC_DECIMALS).replace(/0+$/, "");
  const formattedWhole = Number(wholePart).toLocaleString("en-US");
  if (!fractionPart) {
    return `${sign}${formattedWhole}`;
  }
  const trimmed = fractionPart.slice(0, 2);
  return `${sign}${formattedWhole}.${trimmed}`;
}

/**
 * Hotels landing — the consolidated home of the former PurpleStay homepage.
 * The global Purple Club header (TopNav) owns wallet connect / verify, so this
 * page only carries the paste-a-link hero. "Start Negotiation" sends members
 * to the concierge request form at /stay/request and triggers the canonical
 * sign-in flow for anyone who isn't verified yet.
 */
export default function HotelsHome() {
  const router = useRouter();
  const { enter } = useWalletSignIn();
  const [hotelUrl, setHotelUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedHotelName, setVerifiedHotelName] = useState("");
  const [ctaHint, setCtaHint] = useState("");
  const [burnedLamports, setBurnedLamports] = useState<string | null>(null);
  const [burnedError, setBurnedError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadBurned() {
      try {
        const res = await fetch("/api/pbtc/burned", { cache: "no-store" });
        if (!res.ok) throw new Error("burned");
        const data = (await res.json()) as { burnedLamports?: string };
        if (cancelled) return;
        if (typeof data.burnedLamports === "string") {
          setBurnedLamports(data.burnedLamports);
          setBurnedError(false);
        } else {
          setBurnedError(true);
        }
      } catch {
        if (!cancelled) setBurnedError(true);
      }
    }
    void loadBurned();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hotelUrl.trim()) {
      const clearTimer = setTimeout(() => {
        setIsScanning(false);
        setVerifiedHotelName("");
      }, 0);
      return () => clearTimeout(clearTimer);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsScanning(true);
    const timer = setTimeout(() => {
      const decoded = decodeHotelUrl(hotelUrl);
      setVerifiedHotelName(decoded.hotelName ?? "");
      setIsScanning(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [hotelUrl]);

  async function handleStartNegotiation() {
    setCtaHint("");
    const target = `/stay/request${hotelUrl ? `?url=${encodeURIComponent(hotelUrl)}` : ""}`;
    try {
      const res = await fetch("/api/wallet-auth/session");
      const data = (await res.json()) as {
        authenticated?: boolean;
        pbtcEligible?: boolean;
      };
      if (data.authenticated && data.pbtcEligible) {
        router.push(target);
        return;
      }
      if (data.authenticated && !data.pbtcEligible) {
        setCtaHint("You need at least 1 PBTC to unlock wholesale rates.");
        return;
      }
      setCtaHint("Connect your Solana wallet to verify membership.");
      void enter();
    } catch {
      setCtaHint("Connect your Solana wallet to verify membership.");
      void enter();
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-70" />
      <div className="pointer-events-none absolute -top-40 left-[50%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#7C3AED]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-160px] top-28 h-[380px] w-[380px] rounded-full bg-[#EAB308]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-160px] h-[460px] w-[460px] rounded-full bg-[#4C1D95]/30 blur-3xl" />

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-20 text-center sm:pt-28">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-white/65 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308]" />
          A Private Club
        </span>

        <h1 className="pt-serif mx-auto max-w-4xl text-5xl font-semibold leading-[1.05] text-white sm:text-6xl md:text-7xl">
          Wholesale Rates
          <br />
          for the{" "}
          <span className="bg-gradient-to-b from-[#FDE047] via-[#EAB308] to-[#B45309] bg-clip-text text-transparent">
            Purple Elite
          </span>
        </h1>

        <p className="mt-5 max-w-3xl text-sm text-white/65 sm:text-base">
          Paste your link. We negotiate wholesale. You save up to 20%.
        </p>

        <div className="pt-glass-strong relative mt-12 w-full max-w-2xl overflow-hidden rounded-[28px] p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-white/50">
            <span>Hotel URL · Any booking platform</span>
            {isScanning ? (
              <span className="inline-flex items-center gap-2 text-[#FDE047]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                Scanning…
              </span>
            ) : verifiedHotelName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FDE68A]">
                <span>🛡</span>
                {verifiedHotelName}
              </span>
            ) : null}
          </div>

          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={hotelUrl}
            onChange={(event) => setHotelUrl(event.target.value)}
            placeholder="Paste your Booking.com or Expedia link…"
            className="pt-input w-full rounded-full px-5 py-4 text-sm"
          />

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void handleStartNegotiation()}
              className="pt-cta-gold pt-pulse-gold inline-flex w-full max-w-md items-center justify-center gap-2 rounded-full border border-[#EAB308]/45 px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.18em] transition hover:border-[#FDE047]/70 hover:shadow-[0_0_95px_rgba(234,179,8,0.45)] sm:w-auto sm:max-w-none sm:gap-3 sm:px-8"
            >
              Start Negotiation
              <span className="hidden text-[11px] font-semibold opacity-80 sm:inline">
                (Unlock Off-Market Rates)
              </span>
            </button>
          </div>

          {ctaHint ? (
            <p className="mt-4 text-center text-xs text-[#FDE68A]/90">{ctaHint}</p>
          ) : null}
        </div>

        <p className="mt-8 max-w-4xl text-[11px] uppercase tracking-[0.2em] text-white/40">
          Gated Access · 1 PBTC Minimum ·{" "}
          {cardPaymentsEnabled()
            ? "Book with Credit Card or Crypto"
            : "Pay in USDC on Solana"}{" "}
          · Typical Savings: $80-$350
        </p>
      </section>

      <section className="relative z-10 mx-auto mb-14 w-full max-w-5xl px-6">
        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/45">
          <span className="h-px w-8 bg-white/15" />
          How it works
          <span className="h-px w-8 bg-white/15" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="pt-glass relative overflow-hidden rounded-3xl border border-white/5 p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#7C3AED]/15 blur-2xl" />
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7C3AED]/45 bg-[#7C3AED]/15 text-base text-[#DDD6FE]">
              ✦
            </span>
            <h3 className="pt-serif mt-4 text-xl font-semibold text-white">
              Access
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Hold <span className="font-semibold text-white">1 PBTC</span> in
              your Solana wallet. That&apos;s your one-time membership stake —
              no subscription, no monthly fee.
            </p>
            <Link
              href="/account"
              className="mt-4 inline-flex items-center gap-1 rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#DDD6FE] transition hover:bg-[#7C3AED]/25"
            >
              Get PBTC →
            </Link>
          </article>

          <article className="pt-glass relative overflow-hidden rounded-3xl border border-white/5 p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#EAB308]/15 blur-2xl" />
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#EAB308]/45 bg-[#EAB308]/15 text-base text-[#FDE68A]">
              ✺
            </span>
            <h3 className="pt-serif mt-4 text-xl font-semibold text-white">
              Save
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Paste any Booking.com or Expedia link. Our concierge negotiates a
              private wholesale rate within{" "}
              <span className="font-semibold text-[#FDE68A]">24 hours</span> —
              typically up to{" "}
              <span className="font-semibold text-white">20% off</span>.
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-widest text-white/40">
              Use the paste box above ↑
            </p>
          </article>

          <article className="pt-glass relative overflow-hidden rounded-3xl border border-white/5 p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-500/15 blur-2xl" />
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-300/45 bg-orange-500/15 text-base text-orange-200">
              🔥
            </span>
            <h3 className="pt-serif mt-4 text-xl font-semibold text-white">
              Burn
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Every stay we book buys PBTC from the open market and burns it
              forever — making your stake{" "}
              <span className="font-semibold text-white">more scarce</span>{" "}
              with every booking.
            </p>
            <Link
              href="/burn"
              className="mt-4 inline-flex items-center gap-1 rounded-full border border-orange-300/45 bg-orange-500/15 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-orange-100 transition hover:bg-orange-500/25"
            >
              See the proof →
            </Link>
          </article>
        </div>
      </section>

      <section className="relative z-10 mx-auto mb-14 w-full max-w-5xl px-6">
        <div className="pt-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg" aria-hidden>🔥</span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                Total PBTC Burned
              </p>
              <p className="pt-serif text-2xl font-semibold tabular-nums text-[#FDE047]">
                {burnedLamports ? (
                  <>
                    {formatPbtc(burnedLamports)}{" "}
                    <span className="text-sm text-[#FDE047]/70">PBTC</span>
                  </>
                ) : burnedError ? (
                  <span className="text-sm text-[#FDE047]/60">on-chain · refresh soon</span>
                ) : (
                  <span className="text-sm text-[#FDE047]/60">Reading on-chain…</span>
                )}
              </p>
            </div>
          </div>
          <span className="text-[11px] uppercase tracking-[0.24em] text-white/40">
            Live · Solana mainnet
          </span>
        </div>
      </section>
    </main>
  );
}
