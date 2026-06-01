"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import { decodeHotelUrl } from "@/lib/url-decoder";
import { COUNTRIES } from "@/lib/countries";
import { MEAL_OPTIONS, type MealValue } from "@/lib/meals";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

const PBTC_DECIMALS = 9;

type RequestStatus =
  | "PENDING"
  | "OFFER_READY"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "CONFIRMED";
type RefundabilityPreference = "REFUNDABLE" | "NON_REFUNDABLE" | "FLEXIBLE";

type CreatedRequest = {
  requestCode: string;
  status: RequestStatus;
  submittedAt: string;
};

const statusLabels = [
  { key: "PENDING", text: "Request received. Negotiation started — offer expected within 24 hours." },
  { key: "OFFER_READY", text: "Offer ready with your best available pricing." },
  { key: "PAYMENT_SUBMITTED", text: "Payment submitted — awaiting verification." },
  { key: "PAYMENT_VERIFIED", text: "Payment verified by the concierge team." },
  { key: "CONFIRMED", text: "Booking confirmed and voucher released." },
] as const;

function activeStepIndex(status: RequestStatus) {
  if (status === "PENDING") return 0;
  if (status === "OFFER_READY") return 1;
  if (status === "PAYMENT_SUBMITTED") return 2;
  if (status === "PAYMENT_VERIFIED") return 3;
  return 4;
}

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
 * Non-members see the marketing hero with a paste box; pasting a link and
 * tapping "Start Negotiation" triggers the global Purple Club sign-in. Once
 * a member is connected and PBTC-eligible, the full concierge request form
 * unfolds on this same page so they submit without leaving. The booking
 * "Travel Vault" now lives under My Account (/account/bookings).
 */
export default function HotelsHome() {
  const session = useWalletSession();
  const { enter } = useWalletSignIn();
  const formRef = useRef<HTMLDivElement | null>(null);

  const [hotelUrl, setHotelUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedHotelName, setVerifiedHotelName] = useState("");
  const [isKnownSource, setIsKnownSource] = useState<boolean | null>(null);
  const [decodedChildrenAges, setDecodedChildrenAges] = useState<number[]>([]);
  const [ctaHint, setCtaHint] = useState("");
  const [burnedLamports, setBurnedLamports] = useState<string | null>(null);
  const [burnedError, setBurnedError] = useState(false);

  const [email, setEmail] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [roomType, setRoomType] = useState("Standard Room");
  const [occupancy, setOccupancy] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);
  const [infantsCount, setInfantsCount] = useState(0);
  const [refundabilityPreference, setRefundabilityPreference] =
    useState<RefundabilityPreference>("FLEXIBLE");
  const [mealPreference, setMealPreference] = useState<MealValue>("BREAKFAST");
  const [nationality, setNationality] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const canSubmit = session.authenticated && Boolean(session.pbtcEligible);
  const stepIndex = useMemo(() => {
    if (!created) return -1;
    return activeStepIndex(created.status);
  }, [created]);

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
        setIsKnownSource(null);
        setDecodedChildrenAges([]);
      }, 0);
      return () => clearTimeout(clearTimer);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsScanning(true);
    const timer = setTimeout(() => {
      const decoded = decodeHotelUrl(hotelUrl);
      setVerifiedHotelName(decoded.hotelName ?? "");
      setIsKnownSource(decoded.isKnownSource ?? false);
      if (decoded.checkInDate) setCheckInDate(decoded.checkInDate);
      if (decoded.checkOutDate) setCheckOutDate(decoded.checkOutDate);
      if (decoded.occupancy && decoded.occupancy > 0) setOccupancy(decoded.occupancy);
      if (decoded.children !== undefined && decoded.children >= 0) setChildrenCount(decoded.children);
      if (decoded.infants !== undefined && decoded.infants >= 0) setInfantsCount(decoded.infants);
      setDecodedChildrenAges(decoded.childrenAges ?? []);
      setIsScanning(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [hotelUrl]);

  function handleStartNegotiation() {
    setCtaHint("");
    if (session.authenticated) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setCtaHint("Connect your Solana wallet to verify membership.");
    void enter();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/travel/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          hotelUrl,
          checkInDate,
          checkOutDate,
          roomType,
          occupancy,
          childrenCount,
          infantsCount,
          refundabilityPreference,
          mealPreference,
          nationality,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Request submission failed.");
      }

      setCreated(data);
      setShowSubmitConfirm(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unexpected error occurred.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!created) return;
    setIsRefreshing(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/travel/requests?requestCode=${encodeURIComponent(created.requestCode)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to refresh status.");
      }
      setCreated(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to refresh status.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-70" />
      <div className="pointer-events-none absolute -top-40 left-[50%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#7C3AED]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-160px] top-28 h-[380px] w-[380px] rounded-full bg-[#EAB308]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-160px] h-[460px] w-[460px] rounded-full bg-[#4C1D95]/30 blur-3xl" />

      <section className="relative z-10 flex flex-col items-center px-6 pb-12 pt-16 text-center sm:pt-24">
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

        <div className="pt-glass-strong relative mt-12 w-full max-w-2xl overflow-hidden rounded-[28px] p-6 text-left sm:p-8">
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

          {hotelUrl.trim() && !isScanning && isKnownSource === false ? (
            <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/85">
              <span className="font-semibold text-amber-200">
                We don&apos;t recognize this site.
              </span>{" "}
              Your concierge will still review your request, but verification
              and price comparison may take longer. We source private rates
              fastest from Booking.com, Expedia, Agoda, Hotels.com, and the
              major hotel brands.
            </p>
          ) : null}

          {!session.authenticated ? (
            <div className="mt-6 flex flex-col items-center">
              <button
                type="button"
                onClick={handleStartNegotiation}
                className="pt-cta-gold pt-pulse-gold inline-flex w-full max-w-md items-center justify-center gap-2 rounded-full border border-[#EAB308]/45 px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.18em] transition hover:border-[#FDE047]/70 hover:shadow-[0_0_95px_rgba(234,179,8,0.45)] sm:w-auto sm:max-w-none sm:gap-3 sm:px-8"
              >
                Start Negotiation
                <span className="hidden text-[11px] font-semibold opacity-80 sm:inline">
                  (Unlock Off-Market Rates)
                </span>
              </button>
              {ctaHint ? (
                <p className="mt-4 text-center text-xs text-[#FDE68A]/90">{ctaHint}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-[#FDE68A]/80">
              You&apos;re verified — complete the details below to submit.
            </p>
          )}
        </div>

        <p className="mt-8 max-w-4xl text-[11px] uppercase tracking-[0.2em] text-white/40">
          Gated Access · 1 PBTC Minimum ·{" "}
          {cardPaymentsEnabled()
            ? "Book with Credit Card or Crypto"
            : "Pay in USDC on Solana"}{" "}
          · Typical Savings: $80-$350
        </p>
      </section>

      {session.authenticated ? (
        <section
          ref={formRef}
          className="relative z-10 mx-auto w-full max-w-3xl scroll-mt-24 px-6 pb-8"
        >
          <div className="pt-glass rounded-3xl p-6 sm:p-8">
            <h2 className="pt-serif text-2xl font-semibold text-white sm:text-3xl">
              {verifiedHotelName || "Request your private rate"}
            </h2>
            <p className="mt-2 text-sm text-white/65">
              Confirm your stay details and our concierge will negotiate wholesale pricing.
            </p>

            <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Check-in
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    type="date"
                    value={checkInDate}
                    onChange={(event) => setCheckInDate(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Check-out
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    type="date"
                    value={checkOutDate}
                    onChange={(event) => setCheckOutDate(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Adults
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={occupancy}
                    onChange={(event) => setOccupancy(Number(event.target.value))}
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                    <span className="shrink-0">Children</span>
                    {decodedChildrenAges.length > 0 ? (
                      <span
                        className="truncate text-[10px] normal-case tracking-normal text-white/45"
                        title={`Ages: ${decodedChildrenAges.join(", ")}`}
                      >
                        Ages {decodedChildrenAges.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={childrenCount}
                    onChange={(event) => setChildrenCount(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Infants
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={infantsCount}
                    onChange={(event) => setInfantsCount(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Room type
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    placeholder="Standard Room"
                    value={roomType}
                    onChange={(event) => setRoomType(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Cancellation policy
                  <select
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    value={refundabilityPreference}
                    onChange={(event) =>
                      setRefundabilityPreference(
                        event.target.value as RefundabilityPreference,
                      )
                    }
                  >
                    <option value="FLEXIBLE">Flexible</option>
                    <option value="REFUNDABLE">Refundable</option>
                    <option value="NON_REFUNDABLE">Non-refundable</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Meal preference
                  <select
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    value={mealPreference}
                    onChange={(event) => setMealPreference(event.target.value as MealValue)}
                  >
                    {MEAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                    <span className="shrink-0">Nationality</span>
                    <span
                      className="truncate text-[10px] normal-case tracking-normal text-white/45"
                      title="Helps us unlock market-specific deals."
                    >
                      (helps unlock market-specific deals)
                    </span>
                  </span>
                  <select
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    value={nationality}
                    onChange={(event) => setNationality(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Country
                    </option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  Email address
                  <input
                    className="pt-input rounded-xl px-4 py-3 text-sm"
                    placeholder="name@email.com"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
              </div>

              {!canSubmit ? (
                <p className="rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/5 p-3 text-xs text-[#FDE68A]">
                  You need to hold at least 1 PBTC to submit a request.
                </p>
              ) : null}

              <button
                className="pt-cta-gold mt-2 w-full rounded-full px-5 py-3.5 text-sm font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={isSubmitting || !canSubmit || !hotelUrl.trim()}
              >
                {isSubmitting ? "Submitting…" : "Request Purple Price"}
              </button>
              {!hotelUrl.trim() ? (
                <p className="text-center text-[11px] text-white/45">
                  Paste a hotel link in the box above to begin.
                </p>
              ) : null}
            </form>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {errorMessage}
              </p>
            ) : null}
          </div>

          {created ? (
            <div className="pt-glass mt-8 rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                    Concierge Timeline
                  </p>
                  <h3 className="pt-serif mt-1 text-2xl font-semibold text-white">
                    Request {created.requestCode}
                  </h3>
                </div>
                <button
                  className="rounded-full border border-[#EAB308]/60 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/10 disabled:opacity-60"
                  onClick={refreshStatus}
                  disabled={isRefreshing}
                  type="button"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Request submitted successfully. We have started negotiating now, and you
                should receive an offer within 24 hours.
              </div>

              <div className="mt-5 space-y-2">
                {statusLabels.map((step, index) => {
                  const active = index <= stepIndex;
                  return (
                    <div
                      key={step.key}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition ${
                        active
                          ? "border-[#EAB308]/50 bg-[#EAB308]/10 text-[#F8E9B0]"
                          : "border-white/10 bg-black/20 text-white/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          active ? "bg-[#EAB308] text-black" : "bg-white/10 text-white/60"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span>{step.text}</span>
                    </div>
                  );
                })}
              </div>

              <Link
                href="/account/bookings"
                className="mt-6 inline-flex rounded-full border border-[#EAB308]/60 bg-[#EAB308]/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
              >
                Go to Bookings
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

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

      {showSubmitConfirm && created ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSubmitConfirm(false)}
          />
          <div className="pt-glass-strong pt-safe-bottom-modal relative my-auto w-full max-w-md rounded-3xl p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAB308]/15 text-2xl text-[#FDE047]">
              ✦
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-white/45">
              {created.requestCode}
            </p>
            <h3 className="pt-serif mt-2 text-2xl font-semibold text-white">
              Negotiation started
            </h3>
            <p className="mt-3 text-sm text-white/70">
              Your request is now in our concierge channels. We will deliver your private rate
              within <span className="text-[#FDE68A]">24 hours</span> — track every step in your{" "}
              <span className="text-[#FDE68A]">Travel Vault</span>.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                href="/account/bookings"
                className="pt-cta-gold inline-flex w-full justify-center rounded-full px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em]"
              >
                Open Bookings
              </Link>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="text-[10px] uppercase tracking-widest text-white/55 hover:text-white"
              >
                Stay on this page
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
