"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PurpleHeader } from "@/components/purple-header";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  UsdcPayButton,
  type UsdcPayButtonState,
} from "@/components/usdc-pay-button";
import { AndroidWalletPicker } from "@/components/android-wallet-picker";
import { countryFlagEmoji, getCountryName } from "@/lib/countries";
import { isAndroidWebChrome } from "@/lib/device";
import { mealLabel } from "@/lib/meals";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

type RequestStatus =
  | "PENDING"
  | "OFFER_READY"
  | "OFFER_EXPIRED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "CONFIRMED"
  | "CANCELLED";

type PaymentMethod = "STRIPE" | "USDC";
type ChangeRequestStatusValue = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
type CancellationKindValue = "PRE_PAYMENT" | "REFUND_REQUESTED";
type CancellationActorValue = "MEMBER" | "AGENT";
type CancellationStatusValue = "OPEN" | "PROCESSED" | "REJECTED";

type RoomOffer = {
  key?: string;
  roomType?: string;
  board?: string;
  refundability?: string;
  publicPrice?: string;
  purplePrice?: string;
  paymentLink?: string;
  notes?: string;
  freeCancellationUntil?: string | null;
  cancellationFeePercent?: number | null;
};

type AlternativeOffer = {
  hotelName: string;
  location?: string;
  roomType?: string;
  dates?: string;
  publicPrice?: string;
  purplePrice?: string;
  bookingUrl?: string;
  paymentLink?: string;
  whyWePickedThis: string;
  roomOffers?: RoomOffer[];
};

type GuestRecord = {
  kind: "ADULT" | "CHILD" | "INFANT";
  index: number;
  fullName: string;
  ageYears?: number;
  ageMonths?: number;
};

type DashboardRequest = {
  id: string;
  requestCode: string;
  wallet: string;
  status: RequestStatus;
  roomType: string;
  occupancy: number;
  childrenCount: number;
  infantsCount: number;
  nationality: string | null;
  mealPreference: string;
  submittedAt: string;
  checkInDate: string;
  checkOutDate: string;
  refundabilityPreference: "REFUNDABLE" | "NON_REFUNDABLE" | "FLEXIBLE";
  hotelUrl: string;
  offerMode: "REQUESTED_HOTEL" | "ALTERNATIVES" | "BOTH";
  requestedHotelName: string | null;
  requestedHotelOffers: RoomOffer[] | null;
  alternativeOffers: AlternativeOffer[] | null;
  selectedOfferKey: string | null;
  bookingGuests: GuestRecord[] | null;
  publicPriceUsd: string | null;
  purplePriceUsd: string | null;
  stripePaymentLink: string | null;
  voucherUrl: string | null;
  voucherFileName: string | null;
  usdcPaymentAddress: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentSubmittedAt: string | null;
  paymentRejectReason: string | null;
  expectedUsdcLamports: string | null;
  paymentReferencePubkey: string | null;
  paymentTxSignature: string | null;
  paymentVerifiedAt: string | null;
  paymentVerifiedAmountLamports: string | null;
  changeRequestStatus: ChangeRequestStatusValue | null;
  changeRequestType: string | null;
  changeRequestNote: string | null;
  changeRequestOpenedAt: string | null;
  changeRequestResolvedAt: string | null;
  agentChangeReply: string | null;
  offerSentAt: string | null;
  offerExpiresAt: string | null;
  offerHistory: Array<{
    round: number;
    snapshotAt: string;
    purplePriceUsd: string | null;
    offerExpiresAt: string | null;
  }> | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelActor: CancellationActorValue | null;
  archivedAt: string | null;
  cancellation: {
    id: string;
    kind: CancellationKindValue;
    status: CancellationStatusValue;
    actor: CancellationActorValue;
    reason: string | null;
    refundAmountUsd: string | null;
    refundFeePercent: number | null;
    policySnapshot: { policySummary?: string; basePriceUsd?: string } | null;
    refundTxSignature: string | null;
    agentNote: string | null;
    requestedAt: string;
    processedAt: string | null;
  } | null;
};

type SessionState = {
  authenticated: boolean;
  wallet?: string;
  pbtcEligible?: boolean;
};

const lifecycle: { key: RequestStatus; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "OFFER_READY", label: "Offer Ready" },
  { key: "PAYMENT_SUBMITTED", label: "Payment Submitted" },
  { key: "PAYMENT_VERIFIED", label: "Payment Verified" },
  { key: "CONFIRMED", label: "Confirmed" },
];

function statusIndex(status: RequestStatus) {
  if (status === "OFFER_EXPIRED") return 1;
  if (status === "CANCELLED") return -1;
  return lifecycle.findIndex((s) => s.key === status);
}

function formatCountdown(targetIso: string | null | undefined, now: number): {
  text: string;
  expired: boolean;
  warn: boolean;
} {
  if (!targetIso) return { text: "—", expired: false, warn: false };
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return { text: "—", expired: false, warn: false };
  const diff = target - now;
  if (diff <= 0) return { text: "Offer expired", expired: true, warn: true };
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const warn = diff <= 60 * 60 * 1000;
  if (days > 0) return { text: `${days}d ${hours}h ${minutes}m`, expired: false, warn };
  if (hours > 0) return { text: `${hours}h ${minutes}m`, expired: false, warn };
  if (minutes > 0) return { text: `${minutes}m ${seconds}s`, expired: false, warn };
  return { text: `${seconds}s`, expired: false, warn: true };
}

function dayDelta(targetIso: string, fromMs: number): number {
  const d = new Date(targetIso);
  d.setHours(0, 0, 0, 0);
  const from = new Date(fromMs);
  from.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - from.getTime()) / 86400000);
}

function pluralNights(n: number): string {
  return n === 1 ? "1 night" : `${n} nights`;
}

/**
 * Time-aware countdown copy for confirmed stays. Returns null when there's
 * nothing meaningful to say (e.g. checkout already passed — that row falls
 * into History anyway).
 */
function stayCountdown(
  checkInIso: string,
  checkOutIso: string,
  nowMs: number,
): { text: string; tone: "future" | "imminent" | "live" } | null {
  const daysToCheckIn = dayDelta(checkInIso, nowMs);
  const daysToCheckOut = dayDelta(checkOutIso, nowMs);
  if (daysToCheckOut < 0) return null;
  if (daysToCheckIn > 1) {
    return { text: `Check-in in ${daysToCheckIn} days`, tone: "future" };
  }
  if (daysToCheckIn === 1) {
    return { text: "Check-in tomorrow", tone: "imminent" };
  }
  if (daysToCheckIn === 0) {
    return { text: "Checking in today", tone: "imminent" };
  }
  // Mid-stay: daysToCheckIn < 0, daysToCheckOut >= 0
  const nightsLeft = Math.max(daysToCheckOut, 1);
  return {
    text: `Currently staying · ${pluralNights(nightsLeft)} left`,
    tone: "live",
  };
}

function previewMemberRefund(
  selectedKey: string | null,
  reqOffers: RoomOffer[] | null,
  altOffers: AlternativeOffer[] | null,
  fallbackPurple: string | null,
): { amountUsd: string; feePercent: number; policySummary: string } | null {
  if (!selectedKey) return null;
  const m = selectedKey.match(/^(REQ|ALT)_(\d+)(?:_R_(\d+))?$/);
  if (!m) return null;
  let room: RoomOffer | null = null;
  let altPurple: string | null = null;
  if (m[1] === "REQ") {
    room = reqOffers?.[Number(m[2])] ?? null;
  } else {
    const alt = altOffers?.[Number(m[2])];
    if (alt) {
      altPurple = alt.purplePrice ?? null;
      if (m[3] !== undefined) room = alt.roomOffers?.[Number(m[3])] ?? null;
    }
  }
  const purpleStr = room?.purplePrice ?? altPurple ?? fallbackPurple ?? "";
  const purple = Number(purpleStr || "0");
  const base = Number.isFinite(purple) && purple > 0 ? purple : 0;
  const refundability = (room?.refundability ?? "FLEXIBLE").toUpperCase();
  const fee =
    typeof room?.cancellationFeePercent === "number" ? room.cancellationFeePercent : null;
  const free = room?.freeCancellationUntil ? new Date(room.freeCancellationUntil) : null;
  if (refundability === "REFUNDABLE") {
    if (free && !Number.isNaN(free.getTime()) && free.getTime() >= Date.now()) {
      return {
        amountUsd: base.toFixed(2),
        feePercent: 0,
        policySummary: `Free cancellation until ${free.toISOString().slice(0, 10)} — full refund.`,
      };
    }
    const used = fee ?? 100;
    return {
      amountUsd: Math.max(0, base * (1 - used / 100)).toFixed(2),
      feePercent: used,
      policySummary: free
        ? `Free window ended ${free.toISOString().slice(0, 10)} — ${used}% cancellation fee.`
        : `${used}% cancellation fee applies.`,
    };
  }
  return {
    amountUsd: "0.00",
    feePercent: 100,
    policySummary:
      refundability === "NON_REFUNDABLE"
        ? "Non-refundable rate — concierge will check goodwill options with the supplier."
        : "Flexible rate — concierge will confirm the exact supplier refund.",
  };
}

function formatMoney(value: string | null | undefined) {
  if (!value) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusLabel(status: RequestStatus) {
  return lifecycle.find((s) => s.key === status)?.label ?? status;
}

function refundabilityLabel(value: string) {
  if (value === "NON_REFUNDABLE") return "Non-refundable";
  if (value === "REFUNDABLE") return "Refundable";
  if (value === "FLEXIBLE") return "Flexible";
  return value;
}

function changeRequestLabel(status: ChangeRequestStatusValue) {
  switch (status) {
    case "OPEN":
      return "Awaiting concierge";
    case "IN_PROGRESS":
      return "Concierge reviewing";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Declined";
    default:
      return status;
  }
}

type GuestDraftAdult = { fullName: string };
type GuestDraftChild = { fullName: string; ageYears: string };
type GuestDraftInfant = { fullName: string; ageMonths: string };

type GuestDraft = {
  adults: GuestDraftAdult[];
  children: GuestDraftChild[];
  infants: GuestDraftInfant[];
};

function buildGuestDraft(req: DashboardRequest): GuestDraft {
  const existing = req.bookingGuests ?? [];
  const adults: GuestDraftAdult[] = Array.from({ length: req.occupancy }, (_, i) => {
    const found = existing.find((g) => g.kind === "ADULT" && g.index === i);
    return { fullName: found?.fullName ?? "" };
  });
  const children: GuestDraftChild[] = Array.from({ length: req.childrenCount }, (_, i) => {
    const found = existing.find((g) => g.kind === "CHILD" && g.index === i);
    return {
      fullName: found?.fullName ?? "",
      ageYears: typeof found?.ageYears === "number" ? String(found.ageYears) : "",
    };
  });
  const infants: GuestDraftInfant[] = Array.from({ length: req.infantsCount }, (_, i) => {
    const found = existing.find((g) => g.kind === "INFANT" && g.index === i);
    return {
      fullName: found?.fullName ?? "",
      ageMonths: typeof found?.ageMonths === "number" ? String(found.ageMonths) : "",
    };
  });
  return { adults, children, infants };
}

function parseOfferKey(
  key: string,
): { kind: "REQ" | "ALT"; index: number; roomIndex: number | null } | null {
  const match = key.match(/^(REQ|ALT)_(\d+)(?:_R_(\d+))?$/);
  if (!match) return null;
  return {
    kind: match[1] as "REQ" | "ALT",
    index: Number(match[2]),
    roomIndex: match[3] !== undefined ? Number(match[3]) : null,
  };
}

function savingsPercent(publicPrice?: string | null, purplePrice?: string | null) {
  const pub = Number(publicPrice);
  const pur = Number(purplePrice);
  if (!Number.isFinite(pub) || !Number.isFinite(pur) || pub <= 0 || pur < 0) return null;
  if (pur >= pub) return null;
  return Math.round(((pub - pur) / pub) * 100);
}

function paymentLinkForKey(
  req: DashboardRequest,
  key: string | null,
): string | null {
  if (!key) return req.stripePaymentLink ?? null;
  const parsed = parseOfferKey(key);
  if (!parsed) return req.stripePaymentLink ?? null;
  if (parsed.kind === "REQ") {
    const room = req.requestedHotelOffers?.[parsed.index];
    if (room?.paymentLink) return room.paymentLink;
    return req.stripePaymentLink ?? null;
  }
  const alt = req.alternativeOffers?.[parsed.index];
  if (!alt) return req.stripePaymentLink ?? null;
  if (parsed.roomIndex !== null && alt.roomOffers?.[parsed.roomIndex]) {
    const r = alt.roomOffers[parsed.roomIndex];
    if (r.paymentLink) return r.paymentLink;
  }
  if (alt.paymentLink) return alt.paymentLink;
  return req.stripePaymentLink ?? null;
}

function enumerateOfferKeys(req: DashboardRequest): string[] {
  const keys: string[] = [];
  (req.requestedHotelOffers ?? []).forEach((_, i) => keys.push(`REQ_${i}`));
  (req.alternativeOffers ?? []).forEach((alt, i) => {
    const rooms = alt.roomOffers ?? [];
    if (rooms.length > 0) {
      rooms.forEach((_, ri) => keys.push(`ALT_${i}_R_${ri}`));
    } else {
      keys.push(`ALT_${i}`);
    }
  });
  return keys;
}

function findOfferByKey(req: DashboardRequest, key: string | null) {
  if (!key) return null;
  const parsed = parseOfferKey(key);
  if (!parsed) return null;
  if (parsed.kind === "REQ") {
    const offer = req.requestedHotelOffers?.[parsed.index];
    if (!offer) return null;
    return {
      hotelName: req.requestedHotelName ?? "Requested hotel",
      roomType: offer.roomType ?? req.roomType,
      board: offer.board ?? null,
      refundability: offer.refundability ?? req.refundabilityPreference,
      publicPrice: offer.publicPrice ?? null,
      purplePrice: offer.purplePrice ?? null,
      bookingUrl: req.hotelUrl,
      notes: offer.notes ?? null,
    };
  }
  const alt = req.alternativeOffers?.[parsed.index];
  if (!alt) return null;
  if (parsed.roomIndex !== null && alt.roomOffers && alt.roomOffers[parsed.roomIndex]) {
    const room = alt.roomOffers[parsed.roomIndex];
    return {
      hotelName: alt.hotelName,
      roomType: room.roomType ?? alt.roomType ?? null,
      board: room.board ?? null,
      refundability: room.refundability ?? null,
      publicPrice: room.publicPrice ?? null,
      purplePrice: room.purplePrice ?? null,
      bookingUrl: alt.bookingUrl ?? null,
      notes: room.notes ?? alt.whyWePickedThis ?? null,
    };
  }
  return {
    hotelName: alt.hotelName,
    roomType: alt.roomType ?? null,
    board: null as string | null,
    refundability: null as string | null,
    publicPrice: alt.publicPrice ?? null,
    purplePrice: alt.purplePrice ?? null,
    bookingUrl: alt.bookingUrl ?? null,
    notes: alt.whyWePickedThis ?? null,
  };
}

type SelectedOffer = ReturnType<typeof findOfferByKey>;

/**
 * Read-only summary of the room the member actually booked. Renders in
 * place of the "Pick your option" picker once a request has reached
 * PAYMENT_VERIFIED or CONFIRMED — the picker is meaningless after the
 * member has committed (and visually distracting, as the dashboard
 * showed all submitted offers including unselected ones in a confirmed
 * booking, see the original bug). Reuses `findOfferByKey` so the
 * resolution path is identical to BookSheet's header.
 */
function BookedRoomSummary({ offer }: { offer: SelectedOffer }) {
  if (!offer) return null;
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
        Booked room
      </p>
      <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/5 p-4">
        <p className="pt-serif text-base font-semibold text-white">
          {offer.hotelName}
          {offer.roomType ? ` · ${offer.roomType}` : ""}
        </p>
        <p className="mt-1 text-xs text-white/65">
          {[
            mealLabel(offer.board),
            offer.refundability ? refundabilityLabel(offer.refundability) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {offer.purplePrice ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Purple price
              </span>
              <span className="pt-purple-price">
                {formatMoney(offer.purplePrice)}
              </span>
            </div>
          </div>
        ) : null}
        {offer.notes ? (
          <p className="mt-3 rounded-lg bg-black/30 p-2 text-xs text-white/70">
            {offer.notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Per-row error boundary. Wraps every booking card in the dashboard so a
// rendering bug on one row (bad cancellation snapshot, missing field on a
// legacy record, third-party adapter throwing during connect, etc.) can't
// take down the entire dashboard with `__next_error__` and force a full
// reload. The fallback states the request code, surfaces the exception
// message so we can debug from a user screenshot, and still lets the
// member see / interact with their other bookings.
class RowErrorBoundary extends Component<
  { requestCode: string; children: ReactNode },
  { hasError: boolean; message: string | null }
> {
  state: { hasError: boolean; message: string | null } = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Logs to both the user's browser console (so they can screenshot) and
    // any client-side error reporter we wire up later.
    console.error(
      "[dashboard row crash]",
      this.props.requestCode,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <article className="pt-glass rounded-3xl border border-red-400/35 bg-red-500/5 p-6 text-sm text-red-100">
        <p className="pt-ref-mono text-[10px] uppercase text-red-200/70">
          {this.props.requestCode}
        </p>
        <p className="mt-2 font-semibold text-red-100">
          We couldn&apos;t render this booking card.
        </p>
        <p className="mt-1 text-xs text-red-100/75">
          The rest of your dashboard is fine. Try reloading the page — if it
          keeps happening, reply to the concierge email and we&apos;ll fix it
          on our end.
        </p>
        {this.state.message ? (
          <p className="mt-2 rounded-lg border border-red-400/25 bg-black/30 p-2 text-[11px] text-red-100/70">
            <span className="text-red-100/45">Detail:</span> {this.state.message}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-red-400/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-red-100 hover:bg-red-500/15"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: null })}
            className="rounded-full border border-white/20 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      </article>
    );
  }
}

export default function TravelDashboardPage() {
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [requests, setRequests] = useState<DashboardRequest[]>([]);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [guestDraft, setGuestDraft] = useState<GuestDraft>({ adults: [], children: [], infants: [] });
  const [paymentDraft, setPaymentDraft] = useState<{
    method: PaymentMethod;
    reference: string;
    note: string;
  }>({ method: "USDC", reference: "", note: "" });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [changeOpenId, setChangeOpenId] = useState<string | null>(null);
  const [changeDraft, setChangeDraft] = useState<{ type: string; note: string }>({
    type: "DATES",
    note: "",
  });
  const [submittingChange, setSubmittingChange] = useState(false);

  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  type DashboardTab = "ACTIVE" | "UPCOMING" | "HISTORY";
  const [activeTab, setActiveTab] = useState<DashboardTab>("ACTIVE");
  const [hasNewUpcomingNotice, setHasNewUpcomingNotice] = useState(false);
  const userPickedTabRef = useRef(false);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // Active = anything still in negotiation or payment OR a cancelled
  // booking whose refund hasn't been processed yet (the user paid us;
  // until the money is back in their wallet this is *not* "history",
  // and burying it there made several users assume we'd ghosted them).
  // Upcoming = confirmed stays whose check-out is still in the future.
  // History = past confirmed stays + dead threads (expired offers,
  // cancellations that have already been processed or rejected). Past
  // CONFIRMED stays still get the full card so users can pull voucher
  // / hotel info; expired and cancelled rows are informational only
  // and render as a compact row inside the History tab.
  const tabBuckets = useMemo(() => {
    const active: DashboardRequest[] = [];
    const upcoming: DashboardRequest[] = [];
    const history: DashboardRequest[] = [];
    for (const r of requests) {
      if (r.status === "CANCELLED") {
        // Keep refund-pending cancellations in Active so the member
        // sees them on their primary tab with a clear status. Only
        // PROCESSED (refund sent) or REJECTED (refund declined)
        // cancellations roll into History.
        const refundPending =
          r.cancellation?.kind === "REFUND_REQUESTED" &&
          r.cancellation.status === "OPEN";
        if (refundPending) {
          active.push(r);
        } else {
          history.push(r);
        }
        continue;
      }
      if (r.status === "OFFER_EXPIRED") {
        history.push(r);
        continue;
      }
      if (r.status === "CONFIRMED") {
        const checkout = new Date(r.checkOutDate).getTime();
        if (Number.isFinite(checkout) && checkout < startOfToday) {
          history.push(r);
        } else {
          upcoming.push(r);
        }
        continue;
      }
      active.push(r);
    }
    return { active, upcoming, history };
  }, [requests, startOfToday]);

  // First-time smart default: open the most useful tab. If the user has
  // already tapped a tab, never override their choice on subsequent loads.
  useEffect(() => {
    if (userPickedTabRef.current) return;
    if (requests.length === 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tabBuckets.active.length > 0) {
      setActiveTab("ACTIVE");
      return;
    }
    if (tabBuckets.upcoming.length > 0) {
      setActiveTab("UPCOMING");
      return;
    }
    setActiveTab("HISTORY");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [requests.length, tabBuckets.active.length, tabBuckets.upcoming.length]);

  const selectTab = useCallback((tab: DashboardTab) => {
    userPickedTabRef.current = true;
    setActiveTab(tab);
  }, []);

  const visibleRequests = useMemo(() => {
    if (activeTab === "ACTIVE") return tabBuckets.active;
    if (activeTab === "UPCOMING") return tabBuckets.upcoming;
    return tabBuckets.history;
  }, [activeTab, tabBuckets]);

  const upcomingRequestIds = useMemo(
    () => tabBuckets.upcoming.map((request) => request.id),
    [tabBuckets.upcoming],
  );

  useEffect(() => {
    if (!session.authenticated || !session.wallet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasNewUpcomingNotice(false);
      return;
    }
    if (typeof window === "undefined") return;
    const storageKey = `pt.dashboard.seen-upcoming:${session.wallet}`;
    let seenIds = new Set<string>();
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) {
        seenIds = new Set(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      // Ignore invalid localStorage payloads and re-seed below.
    }

    const hasUnseenUpcoming = upcomingRequestIds.some((id) => !seenIds.has(id));

    if (activeTab === "UPCOMING") {
      const merged = new Set([...seenIds, ...upcomingRequestIds]);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(merged)));
      } catch {
        // LocalStorage can fail in private mode; banner remains best-effort.
      }
      setHasNewUpcomingNotice(false);
      return;
    }

    setHasNewUpcomingNotice(hasUnseenUpcoming);
  }, [activeTab, upcomingRequestIds, session.authenticated, session.wallet]);

  const loadRequests = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/travel/requests?wallet=${encodeURIComponent(walletAddress)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load dashboard.");
      }
      const list = (data.requests ?? []) as DashboardRequest[];
      setRequests(list);
      setExpandedRequestId((prev) => {
        if (list.length === 0) return null;
        if (prev && list.some((request) => request.id === prev)) return prev;
        const actionable = list.find(
          (request) =>
            request.status === "OFFER_READY" ||
            request.status === "PAYMENT_SUBMITTED" ||
            request.status === "PAYMENT_VERIFIED",
        );
        return actionable?.id ?? list[0].id;
      });
      if (list.length === 0) {
        setMessage("No requests found for this wallet yet.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.wallet) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests(session.wallet);
  }, [session.authenticated, session.wallet, loadRequests]);

  const selectOffer = useCallback(
    async (requestCode: string, key: string) => {
      setSelectingId(requestCode);
      try {
        const response = await fetch("/api/travel/requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestCode,
            action: "select_offer",
            selectedOfferKey: key,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Unable to save selection.");
        if (session.wallet) await loadRequests(session.wallet);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to save selection.",
        );
      } finally {
        setSelectingId(null);
      }
    },
    [session.wallet, loadRequests],
  );

  // Auto-select the only available offer when a request transitions to
  // OFFER_READY with exactly one option. Saves the user a redundant click and
  // unblocks the Book button immediately. Keyed on requestCode so we only fire
  // once per request — if the agent later edits the offer set, the ref is
  // re-armed by the cleanup in loadRequests (re-mounting the row).
  const autoSelectFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!session.authenticated) return;
    for (const request of requests) {
      if (request.status !== "OFFER_READY") continue;
      if (request.selectedOfferKey) continue;
      if (autoSelectFiredRef.current.has(request.requestCode)) continue;
      const keys = enumerateOfferKeys(request);
      if (keys.length !== 1) continue;
      autoSelectFiredRef.current.add(request.requestCode);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void selectOffer(request.requestCode, keys[0]);
    }
  }, [requests, session.authenticated, selectOffer]);

  function openBookSheet(req: DashboardRequest) {
    setBookingId(req.requestCode);
    setGuestDraft(buildGuestDraft(req));
    setPaymentDraft({
      // Force USDC when card payments are disabled, even for legacy rows
      // that were created with `paymentMethod: "STRIPE"`. Otherwise the
      // sheet would render an empty STRIPE block (we hide the picker)
      // and the server would reject `submit_payment` with method=STRIPE.
      method:
        cardPaymentsEnabled() && req.paymentMethod ? req.paymentMethod : "USDC",
      reference: req.paymentReference ?? "",
      note: req.paymentNote ?? "",
    });
  }

  const verifyUsdcPayment = useCallback(
    async (req: DashboardRequest, opts?: { silent?: boolean }) => {
      try {
        const res = await fetch(
          `/api/travel/requests/${encodeURIComponent(req.requestCode)}/verify-payment`,
          { method: "POST" },
        );
        const data = (await res.json()) as {
          status?: string;
          kind?: string;
          reason?: string;
          txSignature?: string | null;
        };
        if (res.status === 429) {
          if (!opts?.silent) toast.error("Slow down — try again in a moment.");
          return;
        }
        if (!res.ok) {
          if (!opts?.silent) toast.error(data.reason ?? "Verify failed.");
          return;
        }
        if (data.status === "PAYMENT_VERIFIED" || data.status === "CONFIRMED") {
          if (!opts?.silent) toast.success("Payment verified on-chain.");
          if (session.wallet) await loadRequests(session.wallet);
        } else if (!opts?.silent) {
          toast.message(
            data.reason ??
              "No matching transfer seen yet — wait a few seconds and try again.",
          );
        }
      } catch (error) {
        if (!opts?.silent) {
          toast.error(error instanceof Error ? error.message : "Verify failed.");
        }
      }
    },
    [session.wallet, loadRequests],
  );

  function buildGuestsPayload(): Array<Record<string, unknown>> {
    const guests: Array<Record<string, unknown>> = [];
    guestDraft.adults.forEach((g, i) =>
      guests.push({ kind: "ADULT", index: i, fullName: g.fullName.trim() }),
    );
    guestDraft.children.forEach((g, i) =>
      guests.push({
        kind: "CHILD",
        index: i,
        fullName: g.fullName.trim(),
        ageYears: g.ageYears === "" ? null : Number(g.ageYears),
      }),
    );
    guestDraft.infants.forEach((g, i) =>
      guests.push({
        kind: "INFANT",
        index: i,
        fullName: g.fullName.trim(),
        ageMonths: g.ageMonths === "" ? null : Number(g.ageMonths),
      }),
    );
    return guests;
  }

  async function submitPayment(req: DashboardRequest) {
    setSubmittingPayment(true);
    try {
      const response = await fetch("/api/travel/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestCode: req.requestCode,
          action: "submit_payment",
          paymentMethod: paymentDraft.method,
          paymentReference: paymentDraft.reference,
          paymentNote: paymentDraft.note,
          selectedOfferKey: req.selectedOfferKey,
          bookingGuests: buildGuestsPayload(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit payment.");
      toast.success(
        `Booking sent for verification. You'll receive your voucher once the agent confirms.`,
      );
      setBookingId(null);
      setMessage("");
      if (session.wallet) await loadRequests(session.wallet);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to submit.";
      setMessage(text);
      toast.error(text);
    } finally {
      setSubmittingPayment(false);
    }
  }

  /**
   * Save guest names + lock the selected offer right before the in-page
   * USDC sign step. Stays quiet on success (no toast, no sheet close) so
   * the wallet popup can take over the moment this resolves; the success
   * confirmation comes after the on-chain match flips the row to
   * PAYMENT_VERIFIED. Returns true if the row is ready to sign.
   */
  async function commitBookingForUsdcPay(req: DashboardRequest): Promise<boolean> {
    if (req.status === "PAYMENT_VERIFIED" || req.status === "CONFIRMED") {
      return true;
    }
    try {
      const response = await fetch("/api/travel/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestCode: req.requestCode,
          action: "submit_payment",
          paymentMethod: "USDC",
          paymentReference: paymentDraft.reference,
          paymentNote: paymentDraft.note,
          selectedOfferKey: req.selectedOfferKey,
          bookingGuests: buildGuestsPayload(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = (data as { error?: string }).error ?? "Couldn't lock the booking.";
        toast.error(message);
        return false;
      }
      if (session.wallet) await loadRequests(session.wallet);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't lock the booking.",
      );
      return false;
    }
  }

  function openChangeRequest(requestCode: string) {
    setChangeOpenId(requestCode);
    setChangeDraft({ type: "DATES", note: "" });
  }

  async function submitChangeRequest(requestCode: string) {
    setSubmittingChange(true);
    try {
      const response = await fetch("/api/travel/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestCode,
          action: "request_change_cancel",
          changeRequestType: changeDraft.type,
          changeRequestNote: changeDraft.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send change request.");
      setMessage(`Change request opened for ${data.requestCode}. The concierge will reply soon.`);
      setChangeOpenId(null);
      if (session.wallet) await loadRequests(session.wallet);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send change request.");
    } finally {
      setSubmittingChange(false);
    }
  }

  const bookingRequest = useMemo(
    () => requests.find((r) => r.requestCode === bookingId) ?? null,
    [requests, bookingId],
  );

  // Auto-poll the on-demand verifier while a USDC booking sheet is open and
  // the payment is still pending. Caps at ~6 minutes; the webhook is the
  // primary path, this is a UX nudge for impatient members.
  const pollAttemptsRef = useRef(0);
  useEffect(() => {
    pollAttemptsRef.current = 0;
    if (!bookingRequest) return;
    if (bookingRequest.paymentMethod !== "USDC") return;
    if (
      bookingRequest.status !== "PAYMENT_SUBMITTED" &&
      bookingRequest.status !== "OFFER_READY"
    ) {
      return;
    }
    if (!bookingRequest.expectedUsdcLamports && !bookingRequest.paymentReferencePubkey) {
      return;
    }
    const id = window.setInterval(() => {
      if (pollAttemptsRef.current >= 72) {
        window.clearInterval(id);
        return;
      }
      pollAttemptsRef.current += 1;
      void verifyUsdcPayment(bookingRequest, { silent: true });
    }, 5000);
    return () => window.clearInterval(id);
  }, [bookingRequest, verifyUsdcPayment]);

  // Auto-refresh the requests list while at least one request is still
  // PENDING — this is the window between "I just submitted a request" and
  // "concierge has sent an offer". Without it, members would have to
  // manually refresh to see new offers (the offer arrives via email, but
  // we shouldn't force a tab reload to see it on the page they're already
  // looking at). We pause polling whenever the booking sheet is open so
  // a member's edits to guest fields don't get clobbered by a refetch
  // mid-typing.
  const hasPendingRequest = useMemo(
    () => requests.some((r) => r.status === "PENDING"),
    [requests],
  );
  useEffect(() => {
    if (!hasPendingRequest) return;
    if (!session.wallet) return;
    if (bookingId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (session.wallet) void loadRequests(session.wallet);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [hasPendingRequest, session.wallet, bookingId, loadRequests]);

  async function runRequestAction(
    requestCode: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setActionPending(`${requestCode}:${String(body.action ?? "action")}`);
    try {
      const response = await fetch("/api/travel/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestCode, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed.");
      toast.success(successMessage);
      if (session.wallet) await loadRequests(session.wallet);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Action failed.";
      toast.error(text);
      setMessage(text);
    } finally {
      setActionPending(null);
    }
  }

  async function requestRenegotiation(requestCode: string) {
    await runRequestAction(
      requestCode,
      { action: "request_renegotiation" },
      "Re-negotiation opened — concierge notified.",
    );
  }

  async function cancelRequest(requestCode: string) {
    if (!cancelReason.trim()) {
      toast.error("Add a short reason so the concierge can act on it.");
      return;
    }
    await runRequestAction(
      requestCode,
      { action: "cancel_request", cancelReason: cancelReason.trim() },
      "Cancellation submitted to the concierge.",
    );
    setCancelOpenId(null);
    setCancelReason("");
  }

  async function archiveRequest(requestCode: string) {
    await runRequestAction(
      requestCode,
      { action: "archive" },
      "Removed from your vault.",
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-30" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <PurpleHeader onSessionChange={setSession} />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-12">
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
            Bookings
          </span>
          <h1 className="pt-serif mt-3 text-4xl font-semibold text-white sm:text-5xl">
            Your Travel Vault
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">
            Track each negotiation, select your preferred option, and submit payment when ready.
          </p>
        </div>

        {!session.authenticated ? (
          // Lost-session / fresh-arrival state. The previous copy pointed
          // at "the pill in the top-right" — a 22 px target in the corner
          // that fresh-from-claim users (especially on mobile) rarely
          // notice. We surface a big primary "Verify your wallet" CTA
          // that dispatches the same `purplestay:verify-wallet` event
          // OnboardingSteps uses, so the pill's canonical SIWS / Android-
          // picker flow runs from this button too.
          <div className="pt-glass rounded-2xl p-6">
            <p className="pt-serif text-xl font-semibold text-white">
              Travel Vault is locked
            </p>
            <p className="mt-2 text-sm text-white/70">
              Verify your wallet to load your bookings. First time here?
              You&apos;ll need a Solana wallet — Phantom or Solflare.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.dispatchEvent(
                    new CustomEvent("purplestay:verify-wallet"),
                  );
                }}
                className="pt-cta-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em]"
              >
                Verify your wallet
              </button>
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 hover:bg-white/10"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        ) : null}

        {session.authenticated && loading ? (
          <div className="pt-glass rounded-2xl p-6 text-sm text-white/70">
            Loading bookings…
          </div>
        ) : null}

        {/* Fresh-club-member state. New PBTC holders (gift, invite, or
         * organic) often land here looking for their "first booking" and
         * see literally nothing — the previous design rendered an empty
         * map() and called it a day. This card is the bridge: it
         * confirms they're in, then funnels them straight to the actual
         * value action (paste a hotel link on the homepage). */}
        {session.authenticated && !loading && requests.length === 0 ? (
          <div className="pt-glass rounded-2xl p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FDE68A]">
              Welcome to the club
            </p>
            <p className="pt-serif mt-2 text-2xl font-semibold text-white">
              You&apos;re all set
            </p>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Your concierge desk is ready. To start your first stay, paste a
              hotel link on the homepage and our team will negotiate a
              wholesale rate within 24 hours.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="pt-cta-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em]"
              >
                Paste a hotel link & start →
              </Link>
              <Link
                href="/membership"
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 hover:bg-white/10"
              >
                How it works
              </Link>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="mb-4 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/80">
            {message}
          </p>
        ) : null}

        {session.authenticated ? <GiftVaultCard /> : null}

        {session.authenticated && !loading && requests.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Your trips
            </h2>
            <div className="inline-flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "ACTIVE", label: "Active", count: tabBuckets.active.length },
                  { id: "UPCOMING", label: "Upcoming", count: tabBuckets.upcoming.length },
                  { id: "HISTORY", label: "History", count: tabBuckets.history.length },
                ] as { id: DashboardTab; label: string; count: number }[]
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                      isActive
                        ? "bg-[#EAB308] text-black"
                        : "border border-white/15 text-white/60 hover:text-white"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 ? (
                      <span
                        className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                          isActive
                            ? "bg-black/15 text-black"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {session.authenticated && !loading && requests.length > 0 && visibleRequests.length === 0 ? (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">
            {activeTab === "ACTIVE"
              ? "Nothing in flight. Your active negotiations and pending payments will show up here."
              : activeTab === "UPCOMING"
                ? "No upcoming trips. Confirmed stays whose check-out is still ahead will land here."
                : "Nothing in history yet."}
          </div>
        ) : null}

        {session.authenticated &&
        !loading &&
        requests.length > 0 &&
        activeTab === "ACTIVE" &&
        hasNewUpcomingNotice ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAB308]/35 bg-[#EAB308]/10 px-4 py-3">
            <p className="text-sm text-[#FDE68A]">
              You have a confirmed trip — open Upcoming.
            </p>
            <button
              type="button"
              onClick={() => selectTab("UPCOMING")}
              className="rounded-full border border-[#EAB308]/45 bg-black/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-black/30"
            >
              Open Upcoming
            </button>
          </div>
        ) : null}

        <div className="space-y-5">
          {visibleRequests.map((request) => (
            <RowErrorBoundary
              key={request.id}
              requestCode={request.requestCode}
            >
              {(() => {
            const currentIndex = statusIndex(request.status);
            const selected = request.selectedOfferKey ?? null;
            const reqOffers = request.requestedHotelOffers ?? [];
            const altOffers = request.alternativeOffers ?? [];
            const hasAnyOffers = reqOffers.length > 0 || altOffers.length > 0;
            const canChange =
              request.status === "PENDING" ||
              request.status === "OFFER_READY" ||
              request.status === "PAYMENT_VERIFIED" ||
              request.status === "CONFIRMED";
            // Expired offers were never paid for and never bound to the
            // supplier — there's nothing to cancel. The expired banner's
            // re-negotiate CTA is the only meaningful action; if the member
            // doesn't want it, the thread simply stays as a History row.
            const canCancel =
              request.status === "PENDING" ||
              request.status === "OFFER_READY" ||
              request.status === "PAYMENT_VERIFIED" ||
              request.status === "CONFIRMED";
            const refundPreview =
              request.status === "PAYMENT_VERIFIED" || request.status === "CONFIRMED"
                ? previewMemberRefund(
                    request.selectedOfferKey,
                    request.requestedHotelOffers,
                    request.alternativeOffers,
                    request.purplePriceUsd,
                  )
                : null;
            const flag = countryFlagEmoji(request.nationality);

            const roundNumber = (request.offerHistory?.length ?? 0) + 1;
            const showRoundBadge = (request.offerHistory?.length ?? 0) >= 1;
            const isCancelled = request.status === "CANCELLED";
            const isExpired = request.status === "OFFER_EXPIRED";
            const isPostPayment =
              request.status === "PAYMENT_VERIFIED" ||
              request.status === "CONFIRMED";
            const bookedOffer = isPostPayment
              ? findOfferByKey(request, request.selectedOfferKey ?? null)
              : null;
            const expanded = expandedRequestId === request.id;
            const countdown =
              request.status === "CONFIRMED"
                ? stayCountdown(request.checkInDate, request.checkOutDate, now)
                : null;
            const checkInPassed = dayDelta(request.checkInDate, now) < 0;

            // Compact row inside the History tab for dead threads (expired
            // offers + cancellations). They have no actions and are
            // informational only — render them as a tight one-line ledger
            // entry that expands on tap if the user wants the detail.
            if (activeTab === "HISTORY" && (isExpired || isCancelled) && !expanded) {
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() =>
                    setExpandedRequestId((prev) => (prev === request.id ? null : request.id))
                  }
                  className="pt-glass flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="pt-ref-mono text-[10px] uppercase text-white/45">
                        {request.requestCode}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] ${
                          isCancelled
                            ? "pt-cancelled-badge"
                            : "border border-white/15 bg-white/5 text-white/55"
                        }`}
                      >
                        {isCancelled ? "Cancelled" : "Offer Expired"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-white/80">
                      {request.requestedHotelName || "Requested property"}
                    </p>
                    <p className="text-[11px] text-white/45">
                      {new Date(request.checkInDate).toLocaleDateString()} —{" "}
                      {new Date(request.checkOutDate).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">
                    Tap for details
                  </span>
                </button>
              );
            }

            return (
              <article
                key={request.id}
                className={`pt-glass overflow-hidden rounded-3xl ${isCancelled ? "pt-muted" : ""}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRequestId((prev) => (prev === request.id ? null : request.id))
                  }
                  className="w-full text-left"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="pt-ref-mono text-[11px] uppercase">{request.requestCode}</p>
                        {showRoundBadge ? (
                          <span className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#DDD6FE]">
                            Round {roundNumber} · re-negotiated
                          </span>
                        ) : null}
                      </div>
                      <h2 className="pt-serif mt-1 text-xl font-semibold text-white">
                        {request.requestedHotelName || "Requested property"}
                      </h2>
                      <p className="mt-1 text-xs text-white/55">
                        {new Date(request.checkInDate).toLocaleDateString()} —{" "}
                        {new Date(request.checkOutDate).toLocaleDateString()} · Adults {request.occupancy} ·
                        Children {request.childrenCount} · Infants {request.infantsCount}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {countdown ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            countdown.tone === "live"
                              ? "border border-emerald-300/45 bg-emerald-500/15 text-emerald-100"
                              : countdown.tone === "imminent"
                                ? "border border-[#EAB308]/55 bg-[#EAB308]/15 text-[#FDE68A]"
                                : "border border-[#7C3AED]/45 bg-[#7C3AED]/15 text-[#DDD6FE]"
                          }`}
                          aria-label={countdown.text}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-3 w-3 shrink-0"
                            aria-hidden
                          >
                            <rect x="2" y="3.5" width="12" height="10" rx="1.5" />
                            <path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
                          </svg>
                          {countdown.text}
                        </span>
                      ) : null}
                      {(() => {
                        // Cancelled rows split into two visual states: a
                        // soft "Cancelled" badge for closed-out threads,
                        // and a louder amber "Refund Pending" badge for
                        // rows that still need the concierge to process
                        // the refund. Members reported feeling lost when
                        // a paid cancellation got the same grey badge as
                        // a never-paid one — the money is materially
                        // different and deserves its own indicator.
                        const refundPending =
                          request.status === "CANCELLED" &&
                          request.cancellation?.kind === "REFUND_REQUESTED" &&
                          request.cancellation.status === "OPEN";
                        const badgeClass = refundPending
                          ? "border border-[#EAB308]/55 bg-[#EAB308]/15 text-[#FDE68A]"
                          : request.status === "CONFIRMED"
                            ? "pt-confirmed-badge"
                            : request.status === "PENDING"
                              ? "border border-white/15 bg-white/5 text-white/60"
                              : request.status === "PAYMENT_SUBMITTED"
                                ? "border border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE68A]"
                                : request.status === "PAYMENT_VERIFIED"
                                  ? "border border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                                  : request.status === "OFFER_EXPIRED"
                                    ? "border border-white/20 bg-white/5 text-white/55"
                                    : request.status === "CANCELLED"
                                      ? "pt-cancelled-badge"
                                      : "border border-[#EAB308]/50 bg-[#EAB308]/10 text-[#FDE68A]";
                        const badgeText = refundPending
                          ? "Refund Pending"
                          : request.status === "CONFIRMED"
                            ? "✓ Confirmed"
                            : request.status === "OFFER_EXPIRED"
                              ? "Offer Expired"
                              : request.status === "CANCELLED"
                                ? "Cancelled"
                                : statusLabel(request.status);
                        return (
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeClass}`}
                          >
                            {badgeText}
                          </span>
                        );
                      })()}
                    </div>
                  </header>
                </button>

                {expandedRequestId === request.id ? (
                  <div className="grid gap-6 px-6 py-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-3 text-sm text-white/75">
                    <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                          Stay
                        </p>
                        <p className="pt-ref-mono text-[10px] uppercase">{request.requestCode}</p>
                      </div>
                      <p className="mt-2 text-sm">
                        {new Date(request.checkInDate).toLocaleDateString()} —{" "}
                        {new Date(request.checkOutDate).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs text-white/60">
                        {request.roomType} · {refundabilityLabel(request.refundabilityPreference)} ·{" "}
                        {mealLabel(request.mealPreference)}
                      </p>
                      <p className="mt-1 text-xs text-white/60">
                        Adults {request.occupancy} · Children {request.childrenCount} · Infants {request.infantsCount}
                      </p>
                      {request.nationality ? (
                        <p className="mt-1 text-xs text-white/60">
                          {flag ? `${flag} ` : ""}
                          {getCountryName(request.nationality) ?? request.nationality}
                        </p>
                      ) : null}
                      <a
                        href={request.hotelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-[#FDE68A] underline-offset-2 hover:underline"
                      >
                        Open original listing ↗
                      </a>
                    </div>

                    <ol className="grid gap-3 rounded-xl border border-white/5 bg-black/30 p-4 text-xs">
                      {lifecycle.map((step, index) => {
                        const isCurrent = !isCancelled && index === currentIndex && !isExpired;
                        const isCompleted = !isCancelled && index < currentIndex;
                        const isMuted = isCancelled || (isExpired && index >= 1);
                        const stepClass = isMuted
                          ? "pt-step pt-step-muted"
                          : isCurrent
                            ? "pt-step pt-step-active"
                            : isCompleted
                              ? "pt-step pt-step-completed"
                              : "pt-step pt-step-pending";
                        const labelClass = isMuted
                          ? "text-white/35"
                          : isCurrent
                            ? "font-semibold text-white"
                            : isCompleted
                              ? "text-[#FDE68A]"
                              : "text-white/45";
                        return (
                          <li key={step.key} className={`flex items-start gap-3 ${labelClass}`}>
                            <span className={stepClass}>{index + 1}</span>
                            <span className="flex flex-col">
                              <span>{step.label}</span>
                              {isCurrent ? (
                                <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#FDE68A]">
                                  Active now
                                </span>
                              ) : null}
                              {isExpired && index === 1 ? (
                                <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
                                  Offer expired
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  <div className="space-y-4">
                    {isPostPayment && bookedOffer ? (
                      <BookedRoomSummary offer={bookedOffer} />
                    ) : (currentIndex >= 1 || isExpired) && hasAnyOffers && !isCancelled ? (
                      <div className={`space-y-3 ${isExpired ? "pt-muted" : ""}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                            Pick your option
                          </p>
                          {request.status === "OFFER_READY" && request.offerExpiresAt ? (
                            (() => {
                              const c = formatCountdown(request.offerExpiresAt, now);
                              return (
                                <span
                                  className={`text-[10px] uppercase tracking-[0.22em] ${
                                    c.warn ? "pt-countdown-warn" : "text-[#FDE68A]"
                                  }`}
                                >
                                  Offer valid · {c.text}
                                </span>
                              );
                            })()
                          ) : null}
                        </div>

                        {/* Closed-user-group reminder. Tiny caption, low
                         * visual weight, but always visible whenever rates
                         * are on screen — documents that members were told
                         * the rates are private. Pairs with the same line
                         * in the offer_ready email and ToS section 5. */}
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">
                          Member-exclusive rate · please keep private
                        </p>

                        {request.offerMode === "ALTERNATIVES" ? (
                          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
                            <p>
                              Your requested stay at{" "}
                              <span className="font-semibold text-white">
                                {request.requestedHotelName ?? "your selected property"}
                              </span>{" "}
                              is currently at peak pricing or limited inventory.
                            </p>
                            <p className="mt-1">
                              To protect your value, our concierge negotiated curated alternatives
                              with similar style/location and stronger private rates.
                            </p>
                            <p className="mt-1">
                              If you want us to keep pushing specifically for{" "}
                              <span className="font-semibold text-white">
                                {request.requestedHotelName ?? "your selected property"}
                              </span>
                              , request a re-negotiation and we&apos;ll run another round.
                            </p>
                          </div>
                        ) : null}

                        {request.offerMode === "BOTH" ? (
                          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
                            <p>
                              Your concierge has prepared a quote for{" "}
                              <span className="font-semibold text-white">
                                {request.requestedHotelName ?? "your requested property"}
                              </span>{" "}
                              and also lined up a couple of curated alternatives for the same dates.
                            </p>
                            <p className="mt-1">
                              Compare both, then pick the room that fits you best — you&apos;re free
                              to stay with your original choice or pivot to one of the alternatives.
                            </p>
                          </div>
                        ) : null}

                        {reqOffers.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                              {request.requestedHotelName ?? "Requested hotel"}
                            </p>
                            {reqOffers.map((offer, index) => {
                              const key = `REQ_${index}`;
                              const isSelected = selected === key;
                              const savings = savingsPercent(offer.publicPrice, offer.purplePrice);
                              return (
                                <button
                                  key={`${request.id}-req-${index}`}
                                  type="button"
                                  onClick={() => void selectOffer(request.requestCode, key)}
                                  disabled={selectingId === request.requestCode}
                                  className={`pt-offer-card w-full rounded-2xl p-4 text-left ${
                                    isSelected ? "pt-offer-card-selected" : ""
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="pt-serif text-base font-semibold text-white">
                                      {offer.roomType || request.roomType}
                                    </p>
                                    {isSelected ? (
                                      <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                        Selected
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-white/60">
                                    {mealLabel(offer.board)} ·{" "}
                                    {refundabilityLabel(offer.refundability ?? request.refundabilityPreference)}
                                  </p>
                                  <div className="mt-3 flex flex-wrap items-end gap-3">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                                        Purple price
                                      </span>
                                      <span className="pt-purple-price">
                                        {formatMoney(offer.purplePrice ?? null)}
                                      </span>
                                    </div>
                                    {offer.publicPrice ? (
                                      <div className="flex flex-col pb-0.5">
                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-white/35">
                                          Public
                                          <InfoTooltip label="What's included in this price">
                                            Public price includes all standard booking fees and
                                            taxes so you can compare apples to apples with your
                                            Purple rate. City tax (if applicable) is paid in
                                            cash at the hotel and applies equally to both rates —
                                            your concierge note will flag this when relevant.
                                          </InfoTooltip>
                                        </span>
                                        <span className="pt-public-price-faded text-sm">
                                          {formatMoney(offer.publicPrice)}
                                        </span>
                                      </div>
                                    ) : null}
                                    {savings !== null ? (
                                      <span className="pt-save-badge pt-save-glow ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest">
                                        Save {savings}%
                                      </span>
                                    ) : null}
                                  </div>
                                  {offer.notes ? (
                                    <p className="mt-2 rounded-lg bg-black/30 p-2 text-xs text-white/70">
                                      {offer.notes}
                                    </p>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        {altOffers.length > 0 ? (
                          <div className="space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                              Alternative properties
                            </p>
                            {altOffers.map((offer, index) => {
                              const altKey = `ALT_${index}`;
                              const hasRoomOffers =
                                Array.isArray(offer.roomOffers) && offer.roomOffers.length > 0;
                              const altSelected = !hasRoomOffers && selected === altKey;
                              const anyChildSelected =
                                hasRoomOffers &&
                                offer.roomOffers!.some((_, ri) => selected === `${altKey}_R_${ri}`);
                              return (
                                <div
                                  key={`${request.id}-alt-${index}`}
                                  className={`pt-offer-card rounded-2xl p-4 ${
                                    altSelected || anyChildSelected ? "pt-offer-card-selected" : ""
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="pt-serif text-lg font-semibold text-white">
                                        {offer.hotelName}
                                      </p>
                                      <p className="mt-1 text-xs text-white/60">
                                        {offer.location ?? "Location pending"}
                                        {offer.dates ? ` · ${offer.dates}` : ""}
                                      </p>
                                    </div>
                                    {altSelected || anyChildSelected ? (
                                      <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                        Selected
                                      </span>
                                    ) : null}
                                  </div>

                                  {!hasRoomOffers ? (
                                    <button
                                      type="button"
                                      onClick={() => void selectOffer(request.requestCode, altKey)}
                                      disabled={selectingId === request.requestCode}
                                      className="mt-3 flex w-full flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-white/75 transition hover:border-[#EAB308]/45"
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        <span className="inline-flex items-center gap-1">
                                          Public
                                          <InfoTooltip label="What's included in this price">
                                            Public price includes all standard booking fees and
                                            taxes so you can compare apples to apples with your
                                            Purple rate. City tax (if applicable) is paid in
                                            cash at the hotel and applies equally to both
                                            rates — your concierge note will flag this when
                                            relevant.
                                          </InfoTooltip>
                                        </span>
                                        <span className="text-white/90">
                                          {formatMoney(offer.publicPrice ?? null)}
                                        </span>
                                      </span>
                                      <span>
                                        Purple{" "}
                                        <span className="text-[#FDE047]">
                                          {formatMoney(offer.purplePrice ?? null)}
                                        </span>
                                      </span>
                                      {(() => {
                                        const sav = savingsPercent(offer.publicPrice, offer.purplePrice);
                                        return sav !== null ? (
                                          <span className="pt-save-badge pt-save-glow rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                                            Save {sav}%
                                          </span>
                                        ) : null;
                                      })()}
                                      <span className="ml-auto text-[10px] uppercase tracking-widest text-white/50">
                                        {altSelected ? "Selected" : "Tap to select"}
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {offer.roomOffers!.map((room, rIdx) => {
                                        const rkey = `${altKey}_R_${rIdx}`;
                                        const rSelected = selected === rkey;
                                        const sav = savingsPercent(room.publicPrice, room.purplePrice);
                                        return (
                                          <button
                                            key={rkey}
                                            type="button"
                                            onClick={() => void selectOffer(request.requestCode, rkey)}
                                            disabled={selectingId === request.requestCode}
                                            className={`pt-offer-card w-full rounded-xl p-3 text-left ${
                                              rSelected ? "pt-offer-card-selected" : ""
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <p className="text-sm font-semibold text-white">
                                                {room.roomType || "Room option"}
                                              </p>
                                              {rSelected ? (
                                                <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                                  Selected
                                                </span>
                                              ) : null}
                                            </div>
                                            <p className="mt-1 text-[11px] text-white/60">
                                              {mealLabel(room.board)} ·{" "}
                                              {refundabilityLabel(room.refundability ?? request.refundabilityPreference)}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/75">
                                              <span className="inline-flex items-center gap-1">
                                                <span className="inline-flex items-center gap-1">
                                                  Public
                                                  <InfoTooltip label="What's included in this price">
                                                    Public price includes all standard booking
                                                    fees and taxes so you can compare apples to
                                                    apples with your Purple rate. City tax (if
                                                    applicable) is paid in cash at the hotel and
                                                    applies equally to both rates — your
                                                    concierge note will flag this when relevant.
                                                  </InfoTooltip>
                                                </span>
                                                <span className="text-white/90">
                                                  {formatMoney(room.publicPrice ?? null)}
                                                </span>
                                              </span>
                                              <span>
                                                Purple{" "}
                                                <span className="text-[#FDE047]">
                                                  {formatMoney(room.purplePrice ?? null)}
                                                </span>
                                              </span>
                                              {sav !== null ? (
                                                <span className="pt-save-badge pt-save-glow rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                                                  Save {sav}%
                                                </span>
                                              ) : null}
                                            </div>
                                            {room.notes ? (
                                              <p className="mt-2 rounded-lg bg-black/30 p-2 text-[11px] text-white/70">
                                                {room.notes}
                                              </p>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <p className="mt-3 rounded-lg bg-black/30 p-2 text-xs text-white/70">
                                    <span className="text-white/50">Why we picked:</span>{" "}
                                    {offer.whyWePickedThis}
                                  </p>
                                  {offer.bookingUrl ? (
                                    <a
                                      href={offer.bookingUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:border-[#EAB308]/50"
                                    >
                                      Browse hotel ↗
                                    </a>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="pt-concierge-brief pt-shimmer rounded-2xl p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                          <p className="text-[10px] uppercase tracking-[0.22em] text-[#FDE68A]">
                            Concierge brief — Negotiation in progress
                          </p>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-white/80">
                          Our concierge is opening private channels with the supplier for{" "}
                          <span className="font-semibold text-white">
                            {request.requestedHotelName ?? "your selected property"}
                          </span>
                          . Expect your wholesale offer within{" "}
                          <span className="font-semibold text-[#FDE68A]">24 hours</span>.
                        </p>
                        <p className="mt-2 text-[11px] text-white/45">
                          You can leave this page — we&apos;ll email you the moment your private
                          rate is ready.
                        </p>
                      </div>
                    )}

                    {request.status === "OFFER_READY" ? (
                      (() => {
                        const c = formatCountdown(request.offerExpiresAt, now);
                        return (
                          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                              Confirm booking and payment
                            </p>
                            {request.paymentRejectReason ? (
                              <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
                                <span className="font-semibold text-amber-200">Update:</span> we
                                could not verify your last payment
                                {request.paymentRejectReason.trim()
                                  ? ` — ${request.paymentRejectReason.trim()}`
                                  : ""}
                                . You can submit payment again below.
                              </p>
                            ) : null}
                            {request.offerExpiresAt ? (
                              <p
                                className={`mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                  c.warn ? "pt-countdown-warn" : "text-[#FDE68A]"
                                }`}
                              >
                                Offer expires in · {c.text}
                              </p>
                            ) : null}
                            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                              Subject to supplier availability and final confirmation at the time
                              of payment verification.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => openBookSheet(request)}
                                disabled={!selected}
                                className={`pt-cta-gold rounded-full px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] disabled:opacity-50 ${
                                  selected ? "pt-cta-pulse" : ""
                                }`}
                              >
                                Book
                              </button>
                              {!selected ? (
                                <span className="text-[11px] text-white/55">
                                  Select an option above first.
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                                  {cardPaymentsEnabled()
                                    ? "Pay with credit card or crypto"
                                    : "Pay with USDC on Solana"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : null}

                    {isExpired ? (
                      <div className="pt-expired-banner rounded-2xl p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/40" />
                          <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">
                            {checkInPassed ? "Offer expired · dates past" : "Offer expired"}
                          </p>
                        </div>
                        {checkInPassed ? (
                          <>
                            <p className="mt-3 text-sm leading-relaxed text-white/75">
                              The check-in date for{" "}
                              <span className="font-semibold text-white">
                                {request.requestedHotelName ?? "this property"}
                              </span>{" "}
                              has already passed. Plan a new trip whenever you&apos;re ready —
                              the concierge will source a fresh wholesale rate.
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <a
                                href="/stay"
                                className="rounded-full border border-[#7C3AED]/55 bg-[#7C3AED]/20 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#DDD6FE] hover:bg-[#7C3AED]/30"
                              >
                                Plan a new trip
                              </a>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="mt-3 text-sm leading-relaxed text-white/75">
                              Your wholesale offer for{" "}
                              <span className="font-semibold text-white">
                                {request.requestedHotelName ?? "this property"}
                              </span>{" "}
                              has expired. Wholesale inventory turns over fast — tap below to ask
                              the concierge for a fresh round.
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void requestRenegotiation(request.requestCode)}
                                disabled={
                                  actionPending === `${request.requestCode}:request_renegotiation`
                                }
                                className="rounded-full border border-[#7C3AED]/55 bg-[#7C3AED]/20 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#DDD6FE] hover:bg-[#7C3AED]/30 disabled:opacity-60"
                              >
                                {actionPending === `${request.requestCode}:request_renegotiation`
                                  ? "Sending…"
                                  : "↻ Re-negotiate rate"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}

                    {isCancelled ? (
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/40" />
                          <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">
                            Negotiation closed
                          </p>
                        </div>
                        <p className="mt-3 text-sm text-white/70">
                          This request was cancelled
                          {request.cancelledAt
                            ? ` on ${new Date(request.cancelledAt).toLocaleDateString()}`
                            : ""}
                          {request.cancelActor === "AGENT" ? " by the concierge" : ""}
                          .
                        </p>
                        {request.cancelReason ? (
                          <p className="mt-2 rounded-lg bg-black/30 p-3 text-xs text-white/65">
                            <span className="text-white/45">Reason:</span> {request.cancelReason}
                          </p>
                        ) : null}
                        {request.cancellation?.kind === "REFUND_REQUESTED" ? (
                          request.cancellation.status === "PROCESSED" ? (
                            <div className="mt-3 rounded-xl border border-emerald-300/45 bg-emerald-500/15 p-3 text-xs text-emerald-100">
                              <p className="font-semibold uppercase tracking-[0.18em]">
                                Refund sent
                              </p>
                              <p className="mt-1 text-emerald-100/90">
                                <span className="font-semibold">
                                  {formatMoney(request.cancellation.refundAmountUsd ?? null)}
                                </span>{" "}
                                {request.paymentMethod === "USDC"
                                  ? "USDC has been sent to the wallet you paid from."
                                  : "has been refunded to your original payment method."}
                              </p>
                              {request.cancellation.refundTxSignature ? (
                                request.paymentMethod === "USDC" ? (
                                  <a
                                    href={`https://solscan.io/tx/${request.cancellation.refundTxSignature}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex break-all text-[11px] text-emerald-200 underline-offset-2 hover:underline"
                                  >
                                    {request.cancellation.refundTxSignature}
                                  </a>
                                ) : (
                                  <p className="mt-2 text-[11px] text-emerald-100/70">
                                    <span className="text-emerald-100/50">Stripe refund:</span>{" "}
                                    <span className="pt-ref-mono break-all">
                                      {request.cancellation.refundTxSignature}
                                    </span>
                                  </p>
                                )
                              ) : null}
                              <p className="mt-2 text-[11px] text-emerald-100/70">
                                {request.paymentMethod === "USDC"
                                  ? "Solana settles in seconds. Check your wallet — funds should already be there."
                                  : "Stripe refunds usually arrive in 5-10 business days depending on your bank."}
                              </p>
                            </div>
                          ) : request.cancellation.status === "REJECTED" ? (
                            <div className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-red-100">
                              <p className="font-semibold uppercase tracking-[0.18em]">
                                Refund declined
                              </p>
                              <p className="mt-1 text-red-100/90">
                                Concierge reviewed this cancellation and could not
                                approve a refund.
                              </p>
                              {request.cancellation.agentNote ? (
                                <p className="mt-2 rounded-lg bg-black/25 p-2 text-[11px] text-red-100/85">
                                  <span className="text-red-100/55">Concierge note:</span>{" "}
                                  {request.cancellation.agentNote}
                                </p>
                              ) : null}
                              <p className="mt-2 text-[11px] text-red-100/65">
                                Reply to the concierge email if you&apos;d like to
                                appeal or discuss next steps.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                              <p className="font-semibold uppercase tracking-[0.18em]">
                                Refund being processed
                              </p>
                              <p className="mt-1 text-emerald-100/85">
                                Estimated refund:{" "}
                                <span className="font-semibold">
                                  {formatMoney(request.cancellation.refundAmountUsd ?? null)}
                                </span>
                                {typeof request.cancellation.refundFeePercent === "number"
                                  ? ` · cancellation fee ${request.cancellation.refundFeePercent}%`
                                  : ""}
                              </p>
                              {request.cancellation.policySnapshot?.policySummary ? (
                                <p className="mt-1 text-[11px] text-emerald-100/70">
                                  {request.cancellation.policySnapshot.policySummary}
                                </p>
                              ) : null}
                              <p className="mt-2 text-[11px] text-emerald-100/70">
                                Refunds settle within 48h — concierge will email you once processed.
                              </p>
                            </div>
                          )
                        ) : null}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void archiveRequest(request.requestCode)}
                            disabled={actionPending === `${request.requestCode}:archive`}
                            className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-60"
                          >
                            {actionPending === `${request.requestCode}:archive`
                              ? "Removing…"
                              : "Delete from vault"}
                          </button>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                            Archives this card from your dashboard
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {request.status === "PAYMENT_SUBMITTED" ? (
                      <div className="pt-concierge-brief pt-shimmer rounded-2xl p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                              <p className="text-[10px] uppercase tracking-[0.22em] text-[#FDE68A]">
                                Awaiting concierge review
                              </p>
                            </div>
                            <p className="pt-serif mt-2 text-lg font-semibold text-white">
                              Payment submitted — verification in progress
                            </p>
                            <p className="mt-1 text-xs text-white/65">
                              Once we confirm receipt with the supplier, your voucher will appear
                              here automatically.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openBookSheet(request)}
                            className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:text-white"
                          >
                            Edit details
                          </button>
                        </div>

                        {request.paymentMethod ? (
                          <dl className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/70 sm:grid-cols-3">
                            <div>
                              <dt className="text-[9px] uppercase tracking-[0.18em] text-white/45">
                                Method
                              </dt>
                              <dd className="mt-0.5 text-white">
                                {request.paymentMethod === "STRIPE"
                                  ? "Credit Card"
                                  : request.paymentMethod === "USDC"
                                    ? "USDC · Solana"
                                    : "Cash"}
                              </dd>
                            </div>
                            {request.paymentReference ? (
                              <div className="sm:col-span-1">
                                <dt className="text-[9px] uppercase tracking-[0.18em] text-white/45">
                                  Reference
                                </dt>
                                <dd className="mt-0.5 truncate font-mono text-[#FDE68A]">
                                  {request.paymentReference}
                                </dd>
                              </div>
                            ) : null}
                            {request.paymentSubmittedAt ? (
                              <div>
                                <dt className="text-[9px] uppercase tracking-[0.18em] text-white/45">
                                  Submitted
                                </dt>
                                <dd className="mt-0.5 text-white/80">
                                  {new Date(request.paymentSubmittedAt).toLocaleString()}
                                </dd>
                              </div>
                            ) : null}
                            {request.paymentNote ? (
                              <div className="sm:col-span-3">
                                <dt className="text-[9px] uppercase tracking-[0.18em] text-white/45">
                                  Your note
                                </dt>
                                <dd className="mt-0.5 text-white/80">{request.paymentNote}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}
                      </div>
                    ) : null}

                    {request.status === "PAYMENT_VERIFIED" ? (
                      <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-5">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-300">✓</span>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                            Payment verified
                          </p>
                        </div>
                        <p className="pt-serif mt-2 text-lg font-semibold text-white">
                          Preparing your voucher
                        </p>
                        <p className="mt-1 text-xs text-white/65">
                          Funds confirmed. The concierge is finalising the booking with the supplier
                          and will release your voucher shortly.
                        </p>
                      </div>
                    ) : null}

                    {request.status === "CONFIRMED" ? (
                      <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-5">
                        <div className="flex items-center gap-2">
                          <span className="pt-confirmed-badge inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]">
                            ✓ Confirmed
                          </span>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                            Booking finalised
                          </p>
                        </div>
                        <p className="pt-serif mt-2 text-lg font-semibold text-white">
                          You&apos;re all set — pack your bags.
                        </p>
                        <p className="mt-1 text-xs text-white/65">
                          Present the voucher PDF below at check-in. A copy was also sent to your
                          email on file.
                        </p>
                        <div className="mt-4">
                          {request.voucherUrl ? (
                            <a
                              href={request.voucherUrl}
                              target="_blank"
                              rel="noreferrer"
                              download={request.voucherFileName ?? undefined}
                              className="pt-cta-gold pt-cta-pulse inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em]"
                            >
                              ↓ Download voucher PDF
                            </a>
                          ) : (
                            <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/60">
                              Voucher pending upload by concierge — refresh in a few minutes.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {(canChange || canCancel) && !isCancelled ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                          Booking management
                        </p>
                        <p className="mt-1 text-[11px] text-white/45">
                          Subject to the supplier&apos;s wholesale terms — non-refundable rates may
                          carry penalties or no refund at all.
                        </p>
                        {request.changeRequestStatus ? (
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span
                                className={`rounded-full border px-3 py-1 font-semibold uppercase tracking-widest ${
                                  request.changeRequestStatus === "RESOLVED"
                                    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200"
                                    : request.changeRequestStatus === "REJECTED"
                                      ? "border-red-400/40 bg-red-500/10 text-red-200"
                                      : "border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE68A]"
                                }`}
                              >
                                {changeRequestLabel(request.changeRequestStatus)}
                              </span>
                              {request.changeRequestType ? (
                                <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 uppercase tracking-widest text-white/60">
                                  {request.changeRequestType}
                                </span>
                              ) : null}
                            </div>
                            {request.changeRequestNote ? (
                              <p className="rounded-lg bg-black/30 p-3 text-xs text-white/70">
                                <span className="text-white/45">Your note:</span>{" "}
                                {request.changeRequestNote}
                              </p>
                            ) : null}
                            {request.agentChangeReply ? (
                              <p className="rounded-lg border border-[#EAB308]/30 bg-[#EAB308]/5 p-3 text-xs text-[#FDE68A]">
                                <span className="text-white/45">Concierge:</span>{" "}
                                {request.agentChangeReply}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {canChange ? (
                            <button
                              type="button"
                              onClick={() => openChangeRequest(request.requestCode)}
                              disabled={request.status === "PAYMENT_SUBMITTED"}
                              className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/65 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Request a change
                            </button>
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelOpenId(request.requestCode);
                                setCancelReason("");
                              }}
                              className="rounded-full border border-red-400/35 bg-red-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-red-200 hover:bg-red-500/20"
                            >
                              Cancel booking
                            </button>
                          ) : null}
                          {request.status === "PAYMENT_SUBMITTED" ? (
                            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-widest text-white/40">
                              Locked while payment is being verified
                            </span>
                          ) : null}
                        </div>

                        {changeOpenId === request.requestCode ? (
                          <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
                            <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                              Type
                              <select
                                className="pt-input rounded-xl px-3 py-2 text-sm"
                                value={changeDraft.type}
                                onChange={(e) =>
                                  setChangeDraft((prev) => ({ ...prev, type: e.target.value }))
                                }
                              >
                                <option value="DATES">Change dates</option>
                                <option value="GUESTS">Change guests / room</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </label>
                            <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                              Message
                              <textarea
                                className="pt-input rounded-xl px-3 py-2 text-sm"
                                rows={3}
                                value={changeDraft.note}
                                onChange={(e) =>
                                  setChangeDraft((prev) => ({ ...prev, note: e.target.value }))
                                }
                                placeholder="Briefly describe what you need."
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void submitChangeRequest(request.requestCode)}
                                disabled={submittingChange || !changeDraft.note.trim()}
                                className="pt-cta-gold rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-60"
                              >
                                {submittingChange ? "Sending…" : "Send to concierge"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setChangeOpenId(null)}
                                className="rounded-full border border-white/15 px-4 py-2 text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {cancelOpenId === request.requestCode ? (
                          <div className="mt-3 space-y-3 rounded-xl border border-red-400/25 bg-red-500/5 p-4">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-red-200">
                              Cancel this booking
                            </p>
                            {refundPreview ? (
                              <div className="rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-100">
                                <p className="font-semibold uppercase tracking-[0.18em]">
                                  Estimated refund
                                </p>
                                <p className="mt-1">
                                  <span className="text-base font-semibold">
                                    {formatMoney(refundPreview.amountUsd)}
                                  </span>
                                  {" · "}cancellation fee {refundPreview.feePercent}%
                                </p>
                                <p className="mt-1 text-[10px] text-emerald-100/75">
                                  {refundPreview.policySummary}
                                </p>
                                <p className="mt-2 text-[10px] text-emerald-100/75">
                                  Refunds settle within 48h after concierge review.
                                </p>
                              </div>
                            ) : (
                              <p className="rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-white/55">
                                No payment yet — cancellation is instant and no refund is needed.
                              </p>
                            )}
                            <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                              Reason
                              <textarea
                                className="pt-input rounded-xl px-3 py-2 text-sm"
                                rows={3}
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="A short note for the concierge."
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void cancelRequest(request.requestCode)}
                                disabled={
                                  actionPending === `${request.requestCode}:cancel_request` ||
                                  !cancelReason.trim()
                                }
                                className="rounded-full border border-red-400/45 bg-red-500/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/25 disabled:opacity-60"
                              >
                                {actionPending === `${request.requestCode}:cancel_request`
                                  ? "Cancelling…"
                                  : "Confirm cancellation"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelOpenId(null);
                                  setCancelReason("");
                                }}
                                className="rounded-full border border-white/15 px-4 py-2 text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
                              >
                                Keep booking
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  </div>
                ) : null}
              </article>
            );
              })()}
            </RowErrorBoundary>
          ))}
        </div>
      </section>

      {bookingRequest ? (
        <BookSheet
          request={bookingRequest}
          guestDraft={guestDraft}
          setGuestDraft={setGuestDraft}
          paymentDraft={paymentDraft}
          setPaymentDraft={setPaymentDraft}
          submitting={submittingPayment}
          onClose={() => setBookingId(null)}
          onSubmit={() => void submitPayment(bookingRequest)}
          onVerifyUsdc={() => void verifyUsdcPayment(bookingRequest)}
          onCommitForUsdcPay={() => commitBookingForUsdcPay(bookingRequest)}
        />
      ) : null}

    </main>
  );
}

function BookSheet({
  request,
  guestDraft,
  setGuestDraft,
  paymentDraft,
  setPaymentDraft,
  submitting,
  onClose,
  onSubmit,
  onVerifyUsdc,
  onCommitForUsdcPay,
}: {
  request: DashboardRequest;
  guestDraft: GuestDraft;
  setGuestDraft: (next: GuestDraft) => void;
  paymentDraft: { method: PaymentMethod; reference: string; note: string };
  setPaymentDraft: (
    next:
      | { method: PaymentMethod; reference: string; note: string }
      | ((
          prev: { method: PaymentMethod; reference: string; note: string },
        ) => { method: PaymentMethod; reference: string; note: string }),
  ) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onVerifyUsdc: () => void;
  onCommitForUsdcPay: () => Promise<boolean>;
}) {
  const offer = findOfferByKey(request, request.selectedOfferKey);
  const activePaymentLink = paymentLinkForKey(request, request.selectedOfferKey);
  // Card / Stripe payments are reversibly hidden behind a flag. When off:
  // the method picker collapses to USDC-only, the STRIPE detail block
  // (payment link, receipt input) is removed, and the BookSheet behaves
  // as if USDC is the only option. Server-side `submit_payment` rejects
  // STRIPE so we don't need to worry about a stale draft slipping
  // through.
  const cardEnabled = cardPaymentsEnabled();
  const allAdultsFilled = guestDraft.adults.every((a) => a.fullName.trim().length > 0);
  const allChildrenFilled = guestDraft.children.every(
    (c) => c.fullName.trim().length > 0 && c.ageYears !== "",
  );
  const allInfantsFilled = guestDraft.infants.every(
    (g) => g.fullName.trim().length > 0 && g.ageMonths !== "",
  );
  const guestsValid = allAdultsFilled && allChildrenFilled && allInfantsFilled;

  // The USDC pay flow needs the full invoice triplet — lamports to sign,
  // treasury address to send to, and reference pubkey for on-chain
  // matching. Treating any of these as optional lets the sheet say
  // "ready" while one of them is still null, which then blows up at sign
  // time (UsdcPayButton now throws on a missing reference) or leaves the
  // matcher unable to associate the transfer. Better to keep the
  // member's "Concierge is preparing your invoice" state until all three
  // are stamped — lazy healing usually resolves it within a request.
  const usdcInvoiceReady =
    paymentDraft.method !== "USDC" ||
    Boolean(
      request.expectedUsdcLamports &&
        request.usdcPaymentAddress &&
        request.paymentReferencePubkey,
    );

  const isBookingComplete =
    request.status === "PAYMENT_VERIFIED" || request.status === "CONFIRMED";

  // Once the on-chain match flips us to PAYMENT_VERIFIED, the booking sheet
  // has nothing more for the member to do. Show the verified card briefly
  // so they see the receipt, then auto-close so they land back on their
  // bookings list with the verified row highlighted.
  const autoClosedRef = useRef(false);
  useEffect(() => {
    if (!isBookingComplete) {
      autoClosedRef.current = false;
      return;
    }
    if (autoClosedRef.current) return;
    autoClosedRef.current = true;
    toast.success(
      "Payment verified! The concierge will send your voucher shortly.",
      { duration: 6000 },
    );
    const id = window.setTimeout(() => {
      onClose();
    }, 2400);
    return () => window.clearTimeout(id);
  }, [isBookingComplete, onClose]);

  // STRIPE submissions require a reference (Stripe receipt / charge ID) so the
  // agent has authoritative proof to verify against. USDC stays optional —
  // the on-chain matcher is authoritative there.
  const stripeReferenceMissing =
    paymentDraft.method === "STRIPE" && paymentDraft.reference.trim().length === 0;

  // The salted invoice total — used for the manual rail (Solana Pay URL,
  // QR, copy-pasteable amount). Manual payers send this exact amount so
  // the on-chain "amount-only" fallback can match them when the reference
  // pubkey is missing from their tx.
  const expectedUsdcAmount = useMemo(() => {
    if (!request.expectedUsdcLamports) return null;
    try {
      const lamports = BigInt(request.expectedUsdcLamports);
      const whole = lamports / 1_000_000n;
      const frac = lamports % 1_000_000n;
      const fracStr = frac.toString().padStart(6, "0");
      return `${whole.toString()}.${fracStr}`;
    } catch {
      return null;
    }
  }, [request.expectedUsdcLamports]);

  // The clean dollar floor — used for the connected-wallet rail. The
  // in-page wallet popup signs this (e.g. "$1.00") instead of the salted
  // total ("$1.009694") so the member's wallet UI matches the price they
  // see on the gold CTA. Reference-pubkey matching wins on-chain so the
  // sub-cent salt isn't needed for disambiguation here.
  const roundedUsdcLamports = useMemo(() => {
    if (!request.expectedUsdcLamports) return null;
    try {
      const lamports = BigInt(request.expectedUsdcLamports);
      const floored = (lamports / 1_000_000n) * 1_000_000n;
      return floored > 0n ? floored.toString() : null;
    } catch {
      return null;
    }
  }, [request.expectedUsdcLamports]);

  const roundedUsdcAmount = useMemo(() => {
    if (!roundedUsdcLamports) return null;
    try {
      const whole = BigInt(roundedUsdcLamports) / 1_000_000n;
      return `${whole.toString()}.00`;
    } catch {
      return null;
    }
  }, [roundedUsdcLamports]);

  const solanaPayUrl = useMemo(() => {
    if (!request.usdcPaymentAddress) return null;
    if (!request.expectedUsdcLamports) return null;
    if (!expectedUsdcAmount) return null;
    const search = new URLSearchParams();
    search.set("amount", expectedUsdcAmount);
    search.set("spl-token", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    if (request.paymentReferencePubkey) {
      search.set("reference", request.paymentReferencePubkey);
    }
    search.set("label", "Purple Club");
    search.set("message", `Booking ${request.requestCode}`);
    return `solana:${request.usdcPaymentAddress}?${search.toString()}`;
  }, [
    request.usdcPaymentAddress,
    request.expectedUsdcLamports,
    request.paymentReferencePubkey,
    request.requestCode,
    expectedUsdcAmount,
  ]);

  const isVerifiedUsdc =
    request.paymentMethod === "USDC" &&
    (request.status === "PAYMENT_VERIFIED" || request.status === "CONFIRMED");
  const isPendingUsdc =
    paymentDraft.method === "USDC" &&
    request.paymentMethod === "USDC" &&
    request.status === "PAYMENT_SUBMITTED";

  const verifiedAmount = useMemo(() => {
    if (!request.paymentVerifiedAmountLamports) return null;
    try {
      const lamports = BigInt(request.paymentVerifiedAmountLamports);
      const whole = lamports / 1_000_000n;
      const frac = lamports % 1_000_000n;
      const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "") || "0";
      return `${whole.toString()}.${fracStr}`;
    } catch {
      return null;
    }
  }, [request.paymentVerifiedAmountLamports]);

  const paymentDelta = useMemo(() => {
    if (!request.paymentVerifiedAmountLamports || !request.expectedUsdcLamports) return null;
    try {
      const got = BigInt(request.paymentVerifiedAmountLamports);
      const expected = BigInt(request.expectedUsdcLamports);
      if (got === expected) return null;
      // Treat any payment between the rounded dollar floor and the salted
      // invoice total as exact — that's the connected-wallet rail paying
      // the clean dollar amount the member saw on the CTA.
      const flooredExpected = (expected / 1_000_000n) * 1_000_000n;
      if (got >= flooredExpected && got <= expected) return null;
      const diff = got - expected;
      const sign = diff < 0n ? "-" : "+";
      const abs = diff < 0n ? -diff : diff;
      const whole = abs / 1_000_000n;
      const frac = abs % 1_000_000n;
      const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "") || "0";
      return { sign, formatted: `${whole.toString()}.${fracStr}` };
    } catch {
      return null;
    }
  }, [request.paymentVerifiedAmountLamports, request.expectedUsdcLamports]);

  function copyToClipboard(value: string, label: string) {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied.`))
      .catch(() => toast.error("Could not copy. Long-press to copy manually."));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="pt-glass-strong relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 sm:p-8"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
              Confirm booking · {request.requestCode}
            </p>
            <h2 className="pt-serif mt-1 text-2xl font-semibold text-white">
              {offer?.hotelName ?? request.requestedHotelName ?? "Selected offer"}
            </h2>
            <p className="mt-1 text-xs text-white/60">
              {new Date(request.checkInDate).toLocaleDateString()} —{" "}
              {new Date(request.checkOutDate).toLocaleDateString()}
              {offer?.roomType ? ` · ${offer.roomType}` : ""}
              {offer?.board ? ` · ${mealLabel(offer.board)}` : ""}
            </p>
            {offer?.purplePrice ? (
              <p className="mt-1 text-sm text-[#FDE047]">
                Purple price {formatMoney(offer.purplePrice)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
          >
            Close
          </button>
        </div>

        <section className="mt-6 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">Guests</p>
            <p className="mt-1 text-xs text-white/45">
              Names must match each guest&apos;s passport / ID exactly.
            </p>
          </div>

          {guestDraft.adults.map((adult, i) => (
            <label
              key={`adult-${i}`}
              className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55"
            >
              Adult {i + 1} · Full name
              <input
                className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                value={adult.fullName}
                onChange={(e) => {
                  const next = [...guestDraft.adults];
                  next[i] = { fullName: e.target.value };
                  setGuestDraft({ ...guestDraft, adults: next });
                }}
                placeholder="As shown on passport"
                required
              />
            </label>
          ))}

          {guestDraft.children.map((child, i) => (
            <div key={`child-${i}`} className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                Child {i + 1} · Full name
                <input
                  className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                  value={child.fullName}
                  onChange={(e) => {
                    const next = [...guestDraft.children];
                    next[i] = { ...next[i], fullName: e.target.value };
                    setGuestDraft({ ...guestDraft, children: next });
                  }}
                  required
                />
              </label>
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                Age (years)
                <input
                  className="pt-input rounded-xl px-3 py-2 text-sm"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={17}
                  value={child.ageYears}
                  onChange={(e) => {
                    const next = [...guestDraft.children];
                    next[i] = { ...next[i], ageYears: e.target.value };
                    setGuestDraft({ ...guestDraft, children: next });
                  }}
                  required
                />
              </label>
            </div>
          ))}

          {guestDraft.infants.map((infant, i) => (
            <div key={`infant-${i}`} className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                Infant {i + 1} · Full name
                <input
                  className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                  value={infant.fullName}
                  onChange={(e) => {
                    const next = [...guestDraft.infants];
                    next[i] = { ...next[i], fullName: e.target.value };
                    setGuestDraft({ ...guestDraft, infants: next });
                  }}
                  required
                />
              </label>
              <label className="grid gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55">
                Age (months)
                <input
                  className="pt-input rounded-xl px-3 py-2 text-sm"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={23}
                  value={infant.ageMonths}
                  onChange={(e) => {
                    const next = [...guestDraft.infants];
                    next[i] = { ...next[i], ageMonths: e.target.value };
                    setGuestDraft({ ...guestDraft, infants: next });
                  }}
                  required
                />
              </label>
            </div>
          ))}
        </section>

        <section className="mt-8 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">Payment</p>
          {cardEnabled ? (
            <>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
                {(["USDC", "STRIPE"] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentDraft((prev) => ({ ...prev, method }))}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      paymentDraft.method === method
                        ? "border-[#EAB308]/60 bg-[#EAB308]/15 text-[#FDE047]"
                        : "border-white/15 bg-black/30 text-white/55 hover:text-white"
                    }`}
                  >
                    {method === "USDC" ? "USDC · Solana" : "Credit Card"}
                  </button>
                ))}
              </div>
              {paymentDraft.method === "USDC" ? (
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
                  Preferred · instant settlement
                </p>
              ) : null}
            </>
          ) : null}

          {cardEnabled && paymentDraft.method === "STRIPE" ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
              {activePaymentLink ? (
                <a
                  href={activePaymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#EAB308]/60 bg-[#EAB308]/15 px-4 py-2 text-xs font-semibold text-[#FDE68A] hover:bg-[#EAB308]/25"
                >
                  Pay with Credit Card ↗
                </a>
              ) : (
                <p className="text-xs text-white/65">
                  Credit card link will appear once the concierge sends the offer.
                </p>
              )}
              <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                Stripe receipt URL or charge ID <span className="text-[#FDE68A]">*</span>
                <input
                  className="pt-input rounded-xl px-3 py-2 text-sm normal-case tracking-normal"
                  value={paymentDraft.reference}
                  onChange={(e) =>
                    setPaymentDraft((prev) => ({ ...prev, reference: e.target.value }))
                  }
                  placeholder="https://pay.stripe.com/receipts/… or ch_3O…"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="text-[10px] normal-case tracking-normal text-white/45">
                  Paste the receipt link or charge ID from your Stripe email so the
                  concierge can verify your payment instantly.
                </span>
              </label>
              <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-white/70">
                <span className="font-semibold text-white">After paying,</span> come
                back to this page and tap{" "}
                <span className="font-semibold text-[#FDE68A]">
                  Confirm &amp; submit payment
                </span>
                . You&apos;ll get an email the moment the concierge verifies your
                receipt.
              </p>
            </div>
          ) : null}

          {paymentDraft.method === "USDC" ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
              {isVerifiedUsdc ? (
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">
                    Payment verified on-chain
                  </p>
                  <p className="mt-1">
                    Received {verifiedAmount ? `$${verifiedAmount}` : "USDC"}.
                    {paymentDelta
                      ? ` Off by ${paymentDelta.sign}$${paymentDelta.formatted} — concierge will reconcile.`
                      : ""}
                  </p>
                  {request.paymentTxSignature ? (
                    <a
                      href={`https://solscan.io/tx/${request.paymentTxSignature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex break-all text-[11px] text-emerald-200 underline-offset-2 hover:underline"
                    >
                      {request.paymentTxSignature}
                    </a>
                  ) : null}
                </div>
              ) : !request.expectedUsdcLamports || !request.usdcPaymentAddress ? (
                <p className="text-xs text-white/65">
                  Concierge is preparing your invoice — payment details will appear
                  here in a moment.
                </p>
              ) : (
                <UsdcPayPanel
                  request={request}
                  expectedUsdcAmount={expectedUsdcAmount}
                  roundedUsdcLamports={roundedUsdcLamports}
                  roundedUsdcAmount={roundedUsdcAmount}
                  solanaPayUrl={solanaPayUrl}
                  paymentDraft={paymentDraft}
                  setPaymentDraft={setPaymentDraft}
                  onVerifyUsdc={onVerifyUsdc}
                  isPendingUsdc={isPendingUsdc}
                  copyToClipboard={copyToClipboard}
                  guestsValid={guestsValid}
                  onCommitForUsdcPay={onCommitForUsdcPay}
                />
              )}
            </div>
          ) : null}

          <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
            Note for concierge
            <textarea
              className="pt-input rounded-xl px-3 py-2 text-sm"
              rows={2}
              value={paymentDraft.note}
              onChange={(e) => setPaymentDraft((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Anything the concierge should know"
            />
          </label>
        </section>

        {isBookingComplete ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="pt-cta-gold w-full rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] sm:w-auto sm:py-2.5"
            >
              Back to my bookings
            </button>
            <span className="text-[11px] text-emerald-200/80">
              You&apos;re all set — the voucher arrives once the concierge confirms.
            </span>
          </div>
        ) : paymentDraft.method === "USDC" ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {!guestsValid ? (
              <span className="text-[11px] text-white/55">
                Fill every guest name and age, then tap{" "}
                <span className="font-semibold text-white">Pay {roundedUsdcAmount ? `$${roundedUsdcAmount} ` : ""}USDC</span>{" "}
                above.
              </span>
            ) : !usdcInvoiceReady ? (
              <span className="text-[11px] text-white/55">
                USDC invoice not ready yet — check back when the concierge sends the offer.
              </span>
            ) : (
              <span className="text-[11px] text-white/55">
                Ready to pay — tap{" "}
                <span className="font-semibold text-white">Pay USDC</span> above to
                sign in your wallet.
              </span>
            )}
          </div>
        ) : (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSubmit}
              disabled={
                submitting || !guestsValid || !usdcInvoiceReady || stripeReferenceMissing
              }
              className="pt-cta-gold w-full rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2.5"
            >
              {submitting ? "Saving…" : "Confirm & submit payment"}
            </button>
            {!guestsValid ? (
              <span className="text-[11px] text-white/55">Fill every guest name and age first.</span>
            ) : null}
            {stripeReferenceMissing ? (
              <span className="text-[11px] text-amber-200/85">
                Paste your Stripe receipt URL or charge ID so we can verify.
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function shortAddress(addr: string, head = 6, tail = 4) {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

type StepperState = "idle" | "submitted" | "polling" | "verified";

function VerificationStepper({ state }: { state: StepperState }) {
  const steps: Array<{ key: StepperState; label: string }> = [
    { key: "submitted", label: "Submitted" },
    { key: "polling", label: "Detected on-chain" },
    { key: "verified", label: "Verified" },
  ];
  const order: StepperState[] = ["idle", "submitted", "polling", "verified"];
  const currentRank = order.indexOf(state);

  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
      {steps.map((step, i) => {
        const stepRank = order.indexOf(step.key);
        const isDone = currentRank >= stepRank && state !== "idle";
        const isActive = currentRank === stepRank && state !== "idle";
        const isVerifiedAll = state === "verified";
        const dotClass = isVerifiedAll
          ? "bg-emerald-400 text-black"
          : isActive
            ? "bg-[#FDE047] text-black"
            : isDone
              ? "bg-[#FDE047]/70 text-black"
              : "bg-white/15 text-white/55";
        const labelClass = isVerifiedAll
          ? "text-emerald-200"
          : isDone || isActive
            ? "text-white"
            : "text-white/55";
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${dotClass}`}
            >
              {isVerifiedAll || (isDone && !isActive) ? "✓" : i + 1}
            </span>
            <span className={labelClass}>{step.label}</span>
            {i < steps.length - 1 ? (
              <span className="mx-1 text-white/25">›</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function UsdcPayPanel({
  request,
  expectedUsdcAmount,
  roundedUsdcLamports,
  roundedUsdcAmount,
  solanaPayUrl,
  paymentDraft,
  setPaymentDraft,
  onVerifyUsdc,
  isPendingUsdc,
  copyToClipboard,
  guestsValid,
  onCommitForUsdcPay,
}: {
  request: DashboardRequest;
  expectedUsdcAmount: string | null;
  /** Whole-dollar floor of `expectedUsdcLamports` (used by the in-page button). */
  roundedUsdcLamports: string | null;
  /** "1.00"-style label for the rounded amount. */
  roundedUsdcAmount: string | null;
  solanaPayUrl: string | null;
  paymentDraft: { method: PaymentMethod; reference: string; note: string };
  setPaymentDraft: (
    next:
      | { method: PaymentMethod; reference: string; note: string }
      | ((
          prev: { method: PaymentMethod; reference: string; note: string },
        ) => { method: PaymentMethod; reference: string; note: string }),
  ) => void;
  onVerifyUsdc: () => void;
  isPendingUsdc: boolean;
  copyToClipboard: (value: string, label: string) => void;
  guestsValid: boolean;
  onCommitForUsdcPay: () => Promise<boolean>;
}) {
  const { publicKey, connected, disconnect, wallet, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [signingState, setSigningState] = useState<UsdcPayButtonState>("idle");
  const [connecting, setConnecting] = useState(false);
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);

  const connectedAddress = publicKey?.toBase58() ?? null;

  const stepperState: StepperState = useMemo(() => {
    if (
      request.status === "PAYMENT_VERIFIED" ||
      request.status === "CONFIRMED"
    ) {
      return "verified";
    }
    if (
      signingState === "verifying" ||
      signingState === "done" ||
      isPendingUsdc
    ) {
      return "polling";
    }
    if (
      signingState === "preflight" ||
      signingState === "signing" ||
      signingState === "submitted" ||
      signingState === "confirming"
    ) {
      return "submitted";
    }
    return "idle";
  }, [request.status, signingState, isPendingUsdc]);

  const canPayInPage = Boolean(
    connected && publicKey && request.expectedUsdcLamports && request.usdcPaymentAddress,
  );

  // Connecting from inside the booking sheet has three failure modes:
  //  1. Android Chrome: the default wallet-adapter modal often shows only
  //     one wallet (whichever MWA reports), stranding members who installed
  //     the other. We surface our own Phantom + Solflare picker — same UX
  //     as the homepage / membership pill — so both options are always
  //     visible.
  //  2. A wallet was previously selected but isn't connected (most users on
  //     a fresh desktop load) — `setVisible` shows the picker, but the user
  //     has to click their wallet again. We short-circuit to
  //     `wallet.adapter.connect()` so the extension popup fires directly.
  //  3. No wallet selected — open the standard picker. We `select(null)`
  //     first so the modal definitely re-renders even if a stale selection
  //     lingers.
  const handleConnect = useCallback(async () => {
    if (isAndroidWebChrome()) {
      setAndroidPickerOpen(true);
      return;
    }
    setConnecting(true);
    try {
      if (wallet?.adapter && !connected) {
        try {
          await wallet.adapter.connect();
          return;
        } catch {
        }
      }
      try {
        select(null);
      } catch {
      }
      setVisible(true);
    } finally {
      setConnecting(false);
    }
  }, [wallet, connected, select, setVisible]);

  const handleSwitchWallet = useCallback(async () => {
    try {
      await disconnect();
    } catch {
    }
    try {
      select(null);
    } catch {
    }
    if (isAndroidWebChrome()) {
      setAndroidPickerOpen(true);
      return;
    }
    setVisible(true);
  }, [disconnect, select, setVisible]);

  return (
    <div className="space-y-3">
      <AndroidWalletPicker
        open={androidPickerOpen}
        onClose={() => setAndroidPickerOpen(false)}
      />
      {canPayInPage &&
      roundedUsdcLamports &&
      roundedUsdcAmount &&
      request.usdcPaymentAddress ? (
        <UsdcPayButton
          usdcPaymentAddress={request.usdcPaymentAddress}
          expectedUsdcLamports={roundedUsdcLamports}
          paymentReferencePubkey={request.paymentReferencePubkey}
          requestCode={request.requestCode}
          amountLabel={roundedUsdcAmount}
          onStateChange={setSigningState}
          onSubmitted={onVerifyUsdc}
          onBeforePay={onCommitForUsdcPay}
          disabled={!guestsValid}
          disabledReason="Fill every guest name and age first."
        />
      ) : (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={connecting}
          className="pt-cta-gold inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {connecting
            ? "Opening…"
            : `Connect wallet to pay${roundedUsdcAmount ? ` $${roundedUsdcAmount}` : ""}`}
        </button>
      )}

      <p className="text-[11px] leading-snug text-white/65">
        {canPayInPage
          ? "Fill every guest name above, then tap to open your wallet. Approve the transfer — we verify automatically, no copying needed."
          : "Connect Phantom or Solflare. The transfer is signed in your wallet, then we verify on-chain in seconds."}
      </p>

      <VerificationStepper state={stepperState} />

      {connectedAddress ? (
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
          Paying from{" "}
          <span className="pt-ref-mono normal-case tracking-normal text-white/75">
            {shortAddress(connectedAddress)}
          </span>
          {" · "}
          <button
            type="button"
            onClick={() => void handleSwitchWallet()}
            className="text-white/65 underline-offset-2 hover:text-white hover:underline"
          >
            Switch
          </button>
        </p>
      ) : null}

      <details className="group rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/70">
        <summary className="cursor-pointer select-none list-none text-[10px] uppercase tracking-[0.22em] text-white/55 hover:text-white">
          I&apos;m paying from another wallet ▾
        </summary>
        <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
          <p className="text-[11px] leading-relaxed">
            Send <span className="pt-ref-mono text-[#FDE047]">${expectedUsdcAmount} USDC</span>{" "}
            on Solana mainnet to the address below. The sub-cent suffix is a
            unique invoice tag so we can match your payment without a
            transaction ID.
          </p>
          <div className="flex flex-col items-start gap-3 sm:flex-row">
            {solanaPayUrl ? (
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={solanaPayUrl} size={112} level="M" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="pt-ref-mono break-all text-[11px] text-white">
                {request.usdcPaymentAddress}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(request.usdcPaymentAddress ?? "", "Address")
                  }
                  className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/65 hover:text-white"
                >
                  Copy address
                </button>
                {expectedUsdcAmount ? (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(expectedUsdcAmount, "Amount")}
                    className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/65 hover:text-white"
                  >
                    Copy amount
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onVerifyUsdc}
                  className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 hover:bg-emerald-500/20"
                >
                  I&apos;ve sent it — verify now
                </button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-white/45">
            Solana mainnet only · USDC mint{" "}
            <span className="pt-ref-mono">EPjFW…Dt1v</span> · other chains or
            tokens can&apos;t be matched.
          </p>
          <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
            Tx signature (optional)
            <input
              className="pt-input rounded-xl px-3 py-2 text-xs normal-case tracking-normal"
              value={paymentDraft.reference}
              onChange={(e) =>
                setPaymentDraft((prev) => ({ ...prev, reference: e.target.value }))
              }
              placeholder="Only paste if the concierge asks"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
      </details>
    </div>
  );
}

type GiftRecord = {
  id: string;
  code: string;
  status:
    | "CREATED"
    | "CLAIMED"
    | "FULFILLING"
    | "FULFILLED"
    | "FULFILLMENT_FAILED"
    | "REJECTED";
  recipientWallet: string | null;
  recipientEmail: string | null;
  txSignature: string | null;
  agentNote: string | null;
  createdAt: string;
  claimedAt: string | null;
  fulfilledAt: string | null;
};

type GiftStatePayload = { unlocked: boolean; gift: GiftRecord | null };

function GiftPerkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M20 6h-2.18A3 3 0 0 0 15.5 3h-1.05A2.99 2.99 0 0 0 12 4.05 2.99 2.99 0 0 0 9.55 3H8.5A3 3 0 0 0 5.18 6H4c-1.1 0-2 .9-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8c0-1.1-.9-2-2-2zm-1 14H5V9h14v11zM8.5 5.5A1.5 1.5 0 0 1 10 7h1.5V5.5A1.5 1.5 0 0 1 8.5 4zm7 0A1.5 1.5 0 0 0 14 5.5V7h1.5A1.5 1.5 0 0 0 17 5.5V5a1.5 1.5 0 0 0-1.5-1.5z" />
    </svg>
  );
}

function LockMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 10V8a4 4 0 0 1 8 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

function PbtcCoinMark({
  size = 88,
  dimmed = false,
  withLock = false,
  className = "",
}: {
  size?: number;
  dimmed?: boolean;
  withLock?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/pbtc-hero.png"
        alt="Purple Bitcoin (PBTC)"
        width={size}
        height={size}
        className={`rounded-full object-cover shadow-[0_0_32px_rgba(124,58,237,0.35)] ring-2 ring-inset ring-white/10 ${
          dimmed ? "opacity-50 saturate-[0.85]" : ""
        }`}
        priority={false}
      />
      {withLock ? (
        <div
          className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-violet-400/50 bg-[#0A051A]/90 text-violet-200 shadow-lg"
          aria-hidden
        >
          <LockMiniIcon className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}

function GiftVaultCard() {
  const [state, setState] = useState<GiftStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gifts");
      if (!res.ok) {
        setState({ unlocked: false, gift: null });
      } else {
        const data = (await res.json()) as GiftStatePayload;
        setState(data);
      }
    } catch {
      setState({ unlocked: false, gift: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function createGift() {
    setCreating(true);
    try {
      const res = await fetch("/api/gifts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create gift.");
      setState({ unlocked: true, gift: data.gift as GiftRecord });
      setShareOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create gift.");
    } finally {
      setCreating(false);
    }
  }

  function buildClaimUrl(code: string) {
    if (typeof window === "undefined") return `/claim/${code}`;
    return `${window.location.origin}/claim/${code}`;
  }

  async function copyClaimUrl(code: string) {
    try {
      await navigator.clipboard.writeText(buildClaimUrl(code));
      setCopied(true);
      toast.success("Claim link copied to clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — please copy manually.");
    }
  }

  if (loading) {
    return (
      <div className="mb-10">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
          Community perk
        </p>
        <div className="rounded-2xl border border-dashed border-violet-500/25 bg-violet-950/25 p-5 text-sm text-violet-100/50">
          Checking referral status…
        </div>
      </div>
    );
  }

  if (!state) return null;

  const gift = state.gift;

  // Once the friend has claimed and the on-chain transfer has landed, the
  // full referral card has done its job. Collapse it to a single quiet
  // badge so the dashboard real estate goes back to the bookings list.
  if (gift && gift.status === "FULFILLED") {
    const fulfilledLabel = gift.fulfilledAt
      ? new Date(gift.fulfilledAt).toLocaleDateString()
      : null;
    const solscanUrl = gift.txSignature
      ? `https://solscan.io/tx/${gift.txSignature}`
      : null;
    return (
      <div className="mb-6">
        <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-100">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0 text-emerald-300"
            aria-hidden
          >
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          <span className="font-semibold tracking-wide">
            Gift delivered to your friend
          </span>
          <span className="text-emerald-200/60">·</span>
          <span className="text-emerald-200/80">1 PBTC</span>
          {fulfilledLabel ? (
            <>
              <span className="text-emerald-200/60">·</span>
              <span className="text-emerald-200/65">{fulfilledLabel}</span>
            </>
          ) : null}
          {solscanUrl ? (
            <a
              href={solscanUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-emerald-200/80 underline-offset-2 hover:text-emerald-100 hover:underline"
              title="View on Solscan"
            >
              tx ↗
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (!state.unlocked) {
    return (
      <div className="mb-10">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
          Community perk
        </p>
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-violet-400/35 bg-gradient-to-br from-violet-950/60 via-[#0a0612] to-[#0A051A] p-5 shadow-[0_0_48px_-18px_rgba(124,58,237,0.3)]">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-violet-500/15 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100 ring-1 ring-inset ring-violet-300/20">
              <GiftPerkIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
                Referral gift
              </p>
              <p className="mt-1.5 text-base font-semibold leading-snug tracking-tight text-white">
                1 PBTC for a friend
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-violet-100/60">
                After you complete a verified stay, you get one shareable link. They open it,
                connect a wallet, and receive 1 PBTC for Purple Travel at wholesale. One gift per
                membership—nothing extra for you to pay.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2 sm:items-end sm:pl-2">
              <PbtcCoinMark size={88} dimmed withLock />
              <p className="max-w-[9.5rem] text-center text-[10px] font-medium leading-snug text-violet-200/80 sm:text-right">
                Unlocks after your first verified stay
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!gift) {
    return (
      <div className="mb-10">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
          Community perk
        </p>
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-amber-400/35 bg-gradient-to-br from-amber-950/20 via-violet-950/40 to-[#0A051A] p-5 shadow-[0_0_40px_-12px_rgba(234,179,8,0.15)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EAB308]/20 text-[#FDE68A] ring-1 ring-inset ring-amber-400/30">
                <GiftPerkIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                  Unlocked
                </p>
                <p className="mt-1.5 text-base font-semibold leading-snug text-white">
                  Share 1 PBTC with a friend
                </p>
                <p className="mt-1.5 max-w-xl text-sm text-violet-100/60">
                  Create a one-time link. The first person who uses it and connects a wallet gets the
                  1 PBTC—you are not charged again.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 sm:items-end sm:justify-between">
              <PbtcCoinMark size={80} className="sm:order-1" />
              <button
                type="button"
                onClick={() => void createGift()}
                disabled={creating}
                className="order-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-gradient-to-r from-[#EAB308] to-[#CA8A04] px-6 text-xs font-bold uppercase tracking-[0.18em] text-[#0A051A] shadow-lg shadow-amber-500/20 sm:w-auto sm:min-w-[11.5rem] disabled:opacity-60"
              >
                {creating ? "Generating…" : "Create gift link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const claimUrl = buildClaimUrl(gift.code);
  const statusLabelMap: Record<GiftRecord["status"], string> = {
    CREATED: "Awaiting claim",
    CLAIMED: "Delivery in progress",
    FULFILLING: "Delivery in progress",
    FULFILLED: "Delivered",
    FULFILLMENT_FAILED: "Delivery retrying",
    REJECTED: "Rejected",
  };

  return (
    <div className="mb-10">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
        Community perk
      </p>
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-violet-400/35 bg-gradient-to-br from-violet-950/50 via-[#0a0616] to-[#0A051A] p-5 shadow-[0_0_40px_-14px_rgba(124,58,237,0.28)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/85">
              Gift · {statusLabelMap[gift.status]}
            </p>
            <p className="mt-1.5 text-base font-semibold text-white">Your claim link</p>
            <p className="mt-1.5 text-sm text-violet-100/60">
              Code <span className="pt-ref-mono text-[13px] text-violet-100/90">{gift.code}</span>
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <PbtcCoinMark size={72} className="mx-auto sm:mx-0" />
            <div className="flex w-full flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setShareOpen((prev) => !prev)}
                className="min-h-[40px] flex-1 rounded-full border border-violet-400/30 bg-violet-950/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-violet-100/80 hover:bg-violet-500/10 sm:flex-initial"
              >
                {shareOpen ? "Hide link" : "Show link"}
              </button>
              <button
                type="button"
                onClick={() => void copyClaimUrl(gift.code)}
                className="min-h-[40px] flex-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-100 hover:bg-amber-500/25 sm:flex-initial"
              >
                {copied ? "Copied!" : "Copy URL"}
              </button>
            </div>
          </div>
        </div>

        {shareOpen ? (
          <div className="mt-4 rounded-xl border border-violet-500/20 bg-black/35 p-3 text-[11px] text-violet-100/80">
            <p className="text-[10px] uppercase tracking-widest text-violet-300/60">
              Send to your friend
            </p>
            <p className="pt-ref-mono mt-2 break-all text-[12px] text-[#FDE68A]">{claimUrl}</p>
          </div>
        ) : null}

        {gift.status === "CLAIMED" || gift.status === "FULFILLING" ? (
          <div className="mt-4 rounded-xl border border-[#EAB308]/35 bg-amber-500/10 p-3 text-[11px] text-[#FDE68A]">
            Claimed by{" "}
            <span className="pt-ref-mono">
              {gift.recipientWallet
                ? `${gift.recipientWallet.slice(0, 4)}…${gift.recipientWallet.slice(-4)}`
                : "wallet"}
            </span>
            {gift.claimedAt ? ` on ${new Date(gift.claimedAt).toLocaleDateString()}` : ""}. The
            on-chain transfer is being broadcast — usually under a minute.
          </div>
        ) : null}

        {gift.status === "FULFILLMENT_FAILED" ? (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] text-amber-100">
            Delivery hit a temporary issue. We&apos;ll retry automatically.
          </div>
        ) : null}

        {gift.status === "FULFILLED" ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-[11px] text-emerald-100">
            Delivered{gift.fulfilledAt ? ` on ${new Date(gift.fulfilledAt).toLocaleDateString()}` : ""}.
            {gift.txSignature ? (
              <>
                {" "}
                Tx <span className="pt-ref-mono text-[10px]">{gift.txSignature.slice(0, 12)}…</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
