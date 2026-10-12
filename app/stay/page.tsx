"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import { decodeHotelUrl } from "@/lib/url-decoder";

const STEPS = [
  "Paste a hotel link.",
  "Same room, same dates — 5% off the public rate.",
  "You pay the agency, not the club.",
  "0.25% up to 2% of every booking buys and burns PBTC.",
];

/**
 * Stays. Paste a hotel link, then the concierge request.
 * The travel partner is the counterparty.
 */
export default function StaysPage() {
  const router = useRouter();
  const session = useWalletSession();
  const { enter } = useWalletSignIn();

  const [hotelUrl, setHotelUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedHotelName, setVerifiedHotelName] = useState("");
  const [ctaHint, setCtaHint] = useState("");

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

  function goToRequest() {
    const target = `/stay/request${hotelUrl ? `?url=${encodeURIComponent(hotelUrl)}` : ""}`;
    router.push(target);
  }

  function handleStartNegotiation() {
    setCtaHint("");
    if (session.authenticated && session.pbtcEligible) {
      goToRequest();
      return;
    }
    if (session.authenticated && !session.pbtcEligible) {
      setCtaHint("You need at least 1 PBTC. That is the key.");
      return;
    }
    setCtaHint("Connect your Solana wallet to verify membership.");
    void enter();
  }

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Stays</p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)] sm:text-5xl">Book a stay</h1>
      <div className="mt-4 space-y-1 text-sm text-[var(--bone-dim)]">
        <p>Book through the club&apos;s travel partner.</p>
        <p>Same room, same dates — 5% off the public rate.</p>
        <p>You pay the agency, not the club.</p>
        <p>0.25% up to 2% of every booking buys and burns PBTC.</p>
      </div>

      <form
        className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          handleStartNegotiation();
        }}
      >
        <label className="block text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
          Hotel link
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={hotelUrl}
            onChange={(event) => setHotelUrl(event.target.value)}
            placeholder="Paste a Booking.com or Expedia link"
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--wall)] px-4 py-3 text-sm normal-case tracking-normal text-[var(--bone)] outline-none placeholder:text-[var(--bone-faint)] focus:border-[var(--ink)]"
          />
        </label>
        {isScanning ? (
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[var(--bone-faint)]">
            Reading the link…
          </p>
        ) : verifiedHotelName ? (
          <p className="mt-3 text-sm text-[var(--bone)]">{verifiedHotelName}</p>
        ) : null}
        <button
          type="submit"
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
        >
          Request a stay
        </button>
        {ctaHint ? <p className="mt-3 text-center text-xs text-[var(--warn)]">{ctaHint}</p> : null}
      </form>

      <ol className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-4 py-3 text-sm text-[var(--bone-dim)]">
            <span className="text-[var(--bone-faint)]">0{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <Link
        href="/account/bookings"
        className="mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--ink)]"
      >
        Your bookings
      </Link>
    </main>
  );
}
