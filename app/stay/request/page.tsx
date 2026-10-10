"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import { decodeHotelUrl } from "@/lib/url-decoder";
import { COUNTRIES } from "@/lib/countries";
import { MEAL_OPTIONS, type MealValue } from "@/lib/meals";

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

/**
 * A hotel link is only acceptable if it parses as an http(s) URL. We stay
 * permissive on the host (direct hotel sites and unknown OTAs are valid —
 * those just get the amber "unrecognized site" notice), but reject outright
 * junk like plain text or `<script>` payloads before it reaches the concierge.
 */
function isValidHotelUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Concierge request form (PurpleStay "Step 01"). Reached from the Hotels
 * landing after a member pastes a link and taps Start Negotiation. The hotel
 * URL is carried over via the `?url=` query param and decoded to prefill
 * dates / occupancy. Wallet connect / verify is owned by the global top bar;
 * this page reads the server session to gate submission.
 */
export default function HotelRequestPage() {
  const session = useWalletSession();
  const { enter } = useWalletSignIn();

  const [email, setEmail] = useState("");
  const [hotelUrl, setHotelUrl] = useState("");
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
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedHotelName, setVerifiedHotelName] = useState("");
  const [isKnownSource, setIsKnownSource] = useState<boolean | null>(null);
  const [decodedChildrenAges, setDecodedChildrenAges] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const hotelUrlValid = isValidHotelUrl(hotelUrl);
  const hotelUrlInvalid = hotelUrl.trim().length > 0 && !hotelUrlValid;
  const canSubmit = session.authenticated && Boolean(session.pbtcEligible);

  // Prefill the email field from the member's saved account email, once,
  // and only if they haven't already typed one. The `?url=` flow can land
  // here before the session resolves, so this waits for session.email.
  const emailAutofilled = useRef(false);
  useEffect(() => {
    if (emailAutofilled.current) return;
    if (session.authenticated && session.email) {
      setEmail((current) => (current ? current : session.email ?? ""));
      emailAutofilled.current = true;
    }
  }, [session.authenticated, session.email]);
  const stepIndex = useMemo(() => {
    if (!created) return -1;
    return activeStepIndex(created.status);
  }, [created]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const prefill = url.searchParams.get("url");
    if (prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHotelUrl(prefill);
    }
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session.emailVerified) {
      setErrorMessage("Verify your email on your profile before a stay booking.");
      return;
    }

    if (!isValidHotelUrl(hotelUrl)) {
      setErrorMessage(
        "Enter a valid hotel link — a full web address starting with https://",
      );
      return;
    }

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
    <main className="stay-room mx-auto flex w-full max-w-[720px] flex-col px-4 py-12">
      <section>
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Stays</p>
          <Link
            href="/stay"
            className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-dim)]"
          >
            Back
          </Link>
        </div>

        <h1 className="club-display text-4xl text-[var(--bone)] sm:text-5xl">
          {verifiedHotelName || "Request a stay"}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-[var(--bone-dim)]">
          Confirm the stay. The travel partner books it. Same room, same dates — 5% off the public rate. You pay the agency, not the club.
        </p>

        <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-5 sm:p-6">
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
              Hotel URL
              <div className="relative">
                <input
                  className="pt-input w-full rounded-xl px-4 py-3 text-sm"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Paste your Booking.com, Expedia, or Agoda link"
                  value={hotelUrl}
                  onChange={(event) => setHotelUrl(event.target.value)}
                  required
                />
                {isScanning ? (
                  <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--wall)] px-2 py-0.5 text-[10px] text-[var(--bone-dim)]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                    Scanning
                  </span>
                ) : null}
              </div>
              {verifiedHotelName ? (
                <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--wall)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bone)]">
                  🛡 {verifiedHotelName}
                </span>
              ) : null}
              {hotelUrlInvalid ? (
                <p className="mt-1 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                  <span className="font-semibold text-red-100">
                    That doesn&apos;t look like a valid link.
                  </span>{" "}
                  Paste the full hotel web address starting with{" "}
                  <span className="font-mono">https://</span> — e.g. a
                  Booking.com, Expedia, or Agoda page.
                </p>
              ) : hotelUrl.trim() && !isScanning && hotelUrlValid && isKnownSource === false ? (
                <p className="mt-1 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/85">
                  <span className="font-semibold text-amber-200">
                    We don&apos;t recognize this site.
                  </span>{" "}
                  Your concierge will still review your request, but
                  verification and price comparison may take longer. We
                  source private rates fastest from Booking.com, Expedia,
                  Agoda, Hotels.com, and the major hotel brands (Marriott,
                  Hilton, IHG, Accor, Four Seasons).
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
                Check-in
                <input
                  className="pt-input rounded-xl px-4 py-3 text-sm"
                  type="date"
                  value={checkInDate}
                  onChange={(event) => setCheckInDate(event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
              <label className="grid min-w-0 gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
                <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                  <span className="shrink-0">Children</span>
                  {decodedChildrenAges.length > 0 ? (
                    <span
                      className="truncate text-[10px] normal-case tracking-normal text-[var(--bone-faint)]"
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
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
                Room type
                <input
                  className="pt-input rounded-xl px-4 py-3 text-sm"
                  placeholder="Standard Room"
                  value={roomType}
                  onChange={(event) => setRoomType(event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
              <label className="grid min-w-0 gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
                <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                  <span className="shrink-0">Nationality</span>
                  <span
                    className="truncate text-[10px] normal-case tracking-normal text-[var(--bone-faint)]"
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
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
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
                {session.authenticated && !session.emailVerified ? (
                  <span className="text-[11px] normal-case tracking-normal text-[var(--bone-dim)]">
                    Verify your email on your profile before this stay.{" "}
                    <Link href="/account" className="text-[var(--ink)]">
                      Your profile
                    </Link>
                  </span>
                ) : null}
              </label>
            </div>

            {!canSubmit ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--wall)] p-3 text-xs text-[var(--bone-dim)]">
                <p>
                  {session.authenticated
                    ? "You need to hold at least 1 PBTC to submit a request."
                    : "Connect and verify your wallet to submit. Use the Connect button in the top bar, or tap below."}
                </p>
                {!session.authenticated ? (
                  <button
                    type="button"
                    onClick={() => void enter()}
                    className="mt-2 inline-flex items-center rounded-full border border-[var(--line)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bone)]"
                  >
                    Verify your wallet
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              className="pt-cta-gold mt-2 w-full rounded-full px-5 py-3.5 text-sm font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={isSubmitting || !canSubmit || hotelUrlInvalid}
            >
              {isSubmitting ? "Submitting…" : "Request a stay"}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {errorMessage}
            </p>
          ) : null}
        </div>

        {created ? (
          <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
                  Request
                </p>
                <h2 className="club-display mt-1 text-2xl text-[var(--bone)]">
                  {created.requestCode}
                </h2>
              </div>
              <button
                className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--bone)] disabled:opacity-60"
                onClick={refreshStatus}
                disabled={isRefreshing}
                type="button"
              >
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <p className="mt-5 text-sm text-[var(--bone-dim)]">
              Request received. You pay the agency, not the club. An offer is expected within 24 hours.
            </p>

            <ol className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {statusLabels.map((step, index) => {
                const active = index <= stepIndex;
                return (
                  <li
                    key={step.key}
                    className={`flex items-start gap-3 py-3 text-sm ${
                      active ? "text-[var(--bone)]" : "text-[var(--bone-faint)]"
                    }`}
                  >
                    <span>0{index + 1}</span>
                    <span>{step.text}</span>
                  </li>
                );
              })}
            </ol>

            <Link
              href="/account/bookings"
              className="mt-6 inline-flex text-[11px] uppercase tracking-[0.18em] text-[var(--ink)]"
            >
              Your bookings
            </Link>
          </div>
        ) : null}
      </section>

      {showSubmitConfirm && created ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSubmitConfirm(false)}
          />
          <div className="relative my-auto w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
              {created.requestCode}
            </p>
            <h3 className="club-display mt-2 text-2xl text-[var(--bone)]">Request received</h3>
            <p className="mt-3 text-sm text-[var(--bone-dim)]">
              You pay the agency, not the club. The offer shows up on your bookings.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/account/bookings"
                className="inline-flex w-full justify-center rounded-full bg-[var(--ink)] px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
              >
                Your bookings
              </Link>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="text-[11px] uppercase tracking-[0.16em] text-[var(--bone-dim)]"
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
