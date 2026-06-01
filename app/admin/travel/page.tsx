"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWalletSession } from "@/hooks/useWalletSession";
import { decodeHotelUrl } from "@/lib/url-decoder";
import { countryFlagEmoji, getCountryName } from "@/lib/countries";
import { MEAL_OPTIONS, mealLabel, type MealValue } from "@/lib/meals";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

type RequestStatus =
  | "PENDING"
  | "OFFER_READY"
  | "OFFER_EXPIRED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "CONFIRMED"
  | "CANCELLED";

type OfferMode = "REQUESTED_HOTEL" | "ALTERNATIVES" | "BOTH";

const OFFER_MODE_OPTIONS: ReadonlyArray<{ value: OfferMode; label: string }> = [
  { value: "REQUESTED_HOTEL", label: "Requested" },
  { value: "ALTERNATIVES", label: "Alternatives" },
  { value: "BOTH", label: "Requested + Alts" },
];

function offerModeLabel(mode: OfferMode): string {
  switch (mode) {
    case "REQUESTED_HOTEL":
      return "Requested hotel";
    case "ALTERNATIVES":
      return "Alternatives";
    case "BOTH":
      return "Requested + Alternatives";
  }
}
type PaymentMethod = "STRIPE" | "USDC" | "CASH";
type RefundabilityValue = "REFUNDABLE" | "NON_REFUNDABLE" | "FLEXIBLE";
type ChangeRequestStatusValue = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
type CancellationActorValue = "MEMBER" | "AGENT";
type CancellationKindValue = "PRE_PAYMENT" | "REFUND_REQUESTED";
type CancellationStatusValue = "OPEN" | "PROCESSED" | "REJECTED";

type AdminAction =
  | "save_draft"
  | "send_offer"
  | "mark_payment_verified"
  | "mark_confirmed"
  | "cancel_request"
  | "reject_payment";

type RoomOffer = {
  key?: string;
  roomType: string;
  board: MealValue;
  refundability: RefundabilityValue;
  publicPrice: string;
  purplePrice: string;
  paymentLink?: string;
  notes: string;
  freeCancellationUntil?: string | null;
  cancellationFeePercent?: number | null;
};

type CancellationRecord = {
  id: string;
  kind: CancellationKindValue;
  status: CancellationStatusValue;
  actor: CancellationActorValue;
  reason: string | null;
  refundAmountUsd: string | null;
  refundFeePercent: number | null;
  policySnapshot: { policySummary?: string; basePriceUsd?: string; selectedOfferKey?: string } | null;
  agentNote: string | null;
  refundTxSignature: string | null;
  refundProcessedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
};

type OfferHistoryEntry = {
  round: number;
  snapshotAt: string;
  offerMode: OfferMode;
  publicPriceUsd: string | null;
  purplePriceUsd: string | null;
  requestedHotelOffers: RoomOffer[] | null;
  alternativeOffers: AlternativeOffer[] | null;
  offerSentAt: string | null;
  offerExpiresAt: string | null;
  selectedOfferKey: string | null;
  stripePaymentLink: string | null;
};

type AlternativeOffer = {
  hotelName: string;
  location?: string;
  roomType?: string;
  dates?: string;
  publicPrice?: string;
  purplePrice?: string;
  bookingUrl: string;
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

type AdminRequestRow = {
  id: string;
  requestCode: string;
  wallet: string;
  hotelUrl: string;
  checkInDate: string;
  checkOutDate: string;
  refundabilityPreference: RefundabilityValue;
  status: RequestStatus;
  roomType: string;
  occupancy: number;
  childrenCount: number;
  infantsCount: number;
  nationality: string | null;
  mealPreference: MealValue;
  submittedAt: string;
  offerMode: OfferMode;
  requestedHotelName: string | null;
  publicPriceUsd: string | null;
  purplePriceUsd: string | null;
  requestedHotelOffers: RoomOffer[] | null;
  alternativeOffers: AlternativeOffer[] | null;
  selectedOfferKey: string | null;
  bookingGuests: GuestRecord[] | null;
  stripePaymentLink: string | null;
  voucherUrl: string | null;
  voucherFileName: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentSubmittedAt: string | null;
  paymentRejectReason: string | null;
  changeRequestStatus: ChangeRequestStatusValue | null;
  changeRequestType: string | null;
  changeRequestNote: string | null;
  changeRequestOpenedAt: string | null;
  changeRequestResolvedAt: string | null;
  agentChangeReply: string | null;
  offerSentAt: string | null;
  offerExpiresAt: string | null;
  offerHistory: OfferHistoryEntry[] | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelActor: CancellationActorValue | null;
  archivedAt: string | null;
  cancellation: CancellationRecord | null;
  user: { email: string | null; hasUnlockedGifting?: boolean };
};

type EditableState = {
  offerMode: OfferMode;
  requestedHotelName: string;
  publicPriceUsd: string;
  purplePriceUsd: string;
  requestedHotelOffers: RoomOffer[];
  alternativeOffers: AlternativeOffer[];
  stripePaymentLink: string;
  voucherUrl: string;
  voucherFileName?: string;
  changeReply: string;
  changeStatus: "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  offerValidityHours: number;
  cancelReason: string;
  cancelAgentNote: string;
  showCancelPanel: boolean;
  showPriorRound: boolean;
  refundTxSignature: string;
  refundAgentNote: string;
};

const statuses: RequestStatus[] = [
  "PENDING",
  "OFFER_READY",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "CONFIRMED",
];

const ARCHIVE_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "OFFER_EXPIRED",
  "CANCELLED",
]);

type FilterValue =
  | "NEEDS_ATTENTION"
  | "ARCHIVE"
  | "REFUND_PENDING"
  | RequestStatus;

const SEARCHABLE_FILTERS: ReadonlySet<FilterValue> = new Set<FilterValue>([
  "CONFIRMED",
  "ARCHIVE",
]);

/**
 * A cancelled row whose refund hasn't been processed yet. These used to
 * fall into Archive alongside expired offers, which was the wrong mental
 * model — Archive should be "done, no more action", but a pending refund
 * needs the agent to act within 48h. We surface them in a dedicated
 * "Refund queue" tab, exclude them from Archive, and only let them
 * archive once `cancellation.status` flips to `PROCESSED`.
 *
 * REJECTED cancellations are not "pending" — the agent already decided.
 * They drop into Archive immediately so the queue stays focused on real
 * action items.
 */
function isRefundPending(row: AdminRequestRow): boolean {
  return (
    row.status === "CANCELLED" &&
    row.cancellation?.kind === "REFUND_REQUESTED" &&
    row.cancellation.status === "OPEN"
  );
}

const statusLabel: Record<RequestStatus, string> = {
  PENDING: "Pending",
  OFFER_READY: "Offer Ready",
  OFFER_EXPIRED: "Offer Expired",
  PAYMENT_SUBMITTED: "Payment Submitted",
  PAYMENT_VERIFIED: "Payment Verified",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

const statusPillClass: Record<RequestStatus, string> = {
  PENDING: "border-white/15 bg-white/5 text-white/60",
  OFFER_READY: "border-[#EAB308]/50 bg-[#EAB308]/10 text-[#FDE68A]",
  OFFER_EXPIRED: "border-white/10 bg-white/5 text-white/55",
  PAYMENT_SUBMITTED: "border-sky-300/40 bg-sky-500/10 text-sky-200",
  PAYMENT_VERIFIED: "border-indigo-300/40 bg-indigo-500/10 text-indigo-200",
  CONFIRMED: "border-emerald-300/40 bg-emerald-500/15 text-emerald-200",
  CANCELLED: "border-white/12 bg-white/[0.04] text-white/60",
};

/**
 * Quick-pick reasons agents commonly cite when curating an alternative
 * hotel for a member. Tapping a chip appends the preset to the existing
 * "Why we picked" copy so the agent can stack a couple of reasons in one
 * click without re-typing — they can still edit/delete freely after.
 */
const WHY_PICKED_PRESETS: readonly string[] = [
  "Better location",
  "Higher star rating, same price",
  "Bigger room / suite category",
  "Free cancellation",
  "Better breakfast / board",
  "Closer to the beach",
  "Stronger member reviews",
  "Better fit for families",
  "Quieter neighbourhood",
];

/**
 * Whether a row currently sits in the agent's queue and needs human action.
 * Used to render a pulsing yellow dot in the row header (mirrors the dot the
 * member dashboard shows for "Concierge brief — Negotiation in progress" /
 * "Awaiting concierge review") and to compute the "X need attention" count.
 */
/**
 * Format the agent-facing "Received at" line. The agent triages by
 * SLA pressure (older requests are riskier), so we lead with the
 * relative age and keep the absolute timestamp as a tooltip /
 * supporting detail. Returns null when the row has no submittedAt
 * (shouldn't happen for real records, but defensive).
 */
function formatReceivedAt(
  submittedAt: string | null | undefined,
  nowMs: number,
): { absolute: string; relative: string } | null {
  if (!submittedAt) return null;
  const ts = new Date(submittedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  const deltaSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  let relative: string;
  if (deltaSec < 60) {
    relative = "just now";
  } else if (deltaSec < 3600) {
    const m = Math.floor(deltaSec / 60);
    relative = `${m} min ago`;
  } else if (deltaSec < 86400) {
    const h = Math.floor(deltaSec / 3600);
    relative = `${h}h ago`;
  } else if (deltaSec < 86400 * 7) {
    const d = Math.floor(deltaSec / 86400);
    relative = `${d}d ago`;
  } else {
    const w = Math.floor(deltaSec / (86400 * 7));
    relative = `${w}w ago`;
  }
  return {
    absolute: new Date(submittedAt).toLocaleString(),
    relative,
  };
}

function requestNeedsAgentAction(row: AdminRequestRow): boolean {
  if (
    row.changeRequestStatus === "OPEN" ||
    row.changeRequestStatus === "IN_PROGRESS"
  ) {
    return true;
  }
  if (
    row.cancellation?.kind === "REFUND_REQUESTED" &&
    row.cancellation.status === "OPEN"
  ) {
    return true;
  }
  switch (row.status) {
    case "PENDING":
    case "PAYMENT_SUBMITTED":
    case "PAYMENT_VERIFIED":
      return true;
    default:
      return false;
  }
}

function attentionReason(row: AdminRequestRow): string {
  if (
    row.changeRequestStatus === "OPEN" ||
    row.changeRequestStatus === "IN_PROGRESS"
  ) {
    return "Member opened a change request";
  }
  if (
    row.cancellation?.kind === "REFUND_REQUESTED" &&
    row.cancellation.status === "OPEN"
  ) {
    return "Refund pending — process within 48h";
  }
  switch (row.status) {
    case "PENDING":
      return "Draft and send the offer";
    case "PAYMENT_SUBMITTED":
      return "Verify the member's payment";
    case "PAYMENT_VERIFIED":
      return "Upload the voucher and confirm the booking";
    default:
      return "";
  }
}

function previewRefund(
  selectedOfferKey: string | null,
  requestedHotelOffers: RoomOffer[] | null,
  alternativeOffers: AlternativeOffer[] | null,
  fallbackPurple: string | null,
): { amountUsd: string; feePercent: number; policySummary: string; basePriceUsd: string } | null {
  if (!selectedOfferKey) return null;
  const match = selectedOfferKey.match(/^(REQ|ALT)_(\d+)(?:_R_(\d+))?$/);
  if (!match) return null;
  const kind = match[1];
  const idx = Number(match[2]);
  const roomIdx = match[3] !== undefined ? Number(match[3]) : null;

  let room: RoomOffer | null = null;
  let altPurple: string | null = null;
  if (kind === "REQ") {
    room = requestedHotelOffers?.[idx] ?? null;
  } else {
    const alt = alternativeOffers?.[idx];
    if (alt) {
      altPurple = alt.purplePrice ?? null;
      if (roomIdx !== null) room = alt.roomOffers?.[roomIdx] ?? null;
    }
  }

  const purpleStr = room?.purplePrice ?? altPurple ?? fallbackPurple ?? "";
  const basePrice = Number(purpleStr || "0");
  const baseValid = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 0;

  const refundability = (room?.refundability ?? "FLEXIBLE") as RefundabilityValue;
  const fee =
    typeof room?.cancellationFeePercent === "number" ? room.cancellationFeePercent : null;
  const freeUntil = room?.freeCancellationUntil ? new Date(room.freeCancellationUntil) : null;

  if (refundability === "REFUNDABLE") {
    if (freeUntil && !Number.isNaN(freeUntil.getTime()) && freeUntil.getTime() >= Date.now()) {
      return {
        amountUsd: baseValid.toFixed(2),
        feePercent: 0,
        policySummary: `Free cancel until ${freeUntil.toISOString().slice(0, 10)} — 100% refund.`,
        basePriceUsd: baseValid.toFixed(2),
      };
    }
    const usedFee = fee ?? 100;
    const refund = Math.max(0, baseValid * (1 - usedFee / 100));
    return {
      amountUsd: refund.toFixed(2),
      feePercent: usedFee,
      policySummary: freeUntil
        ? `Free window ended ${freeUntil.toISOString().slice(0, 10)} — ${usedFee}% fee.`
        : `${usedFee}% cancellation fee.`,
      basePriceUsd: baseValid.toFixed(2),
    };
  }
  if (refundability === "NON_REFUNDABLE") {
    return {
      amountUsd: "0.00",
      feePercent: 100,
      policySummary: "Non-refundable rate — concierge negotiates goodwill.",
      basePriceUsd: baseValid.toFixed(2),
    };
  }
  return {
    amountUsd: "0.00",
    feePercent: 100,
    policySummary: "Flexible rate — concierge confirms supplier policy.",
    basePriceUsd: baseValid.toFixed(2),
  };
}

function renderRoomRefundPreview(room: RoomOffer): { primary: string; secondary?: string } {
  const purple = Number(room.purplePrice || "0");
  if (!Number.isFinite(purple) || purple <= 0) {
    return { primary: "Add a Purple price first." };
  }

  const rawFee =
    typeof room.cancellationFeePercent === "number" ? room.cancellationFeePercent : 100;
  const fee = Math.max(0, Math.min(100, rawFee));
  const feeRefund = Math.max(0, purple * (1 - fee / 100));
  const free = room.freeCancellationUntil ? new Date(room.freeCancellationUntil) : null;
  const inWindow = free && !Number.isNaN(free.getTime()) && free.getTime() >= Date.now();

  if (inWindow) {
    const dateLabel = free.toISOString().slice(0, 10);
    const afterWindow =
      fee >= 100
        ? `After ${dateLabel}: non-refundable (0% refund).`
        : `After ${dateLabel}: ${fee}% fee — refund $${feeRefund.toFixed(2)}.`;
    return {
      primary: `Now: 100% refund — $${purple.toFixed(2)}`,
      secondary: afterWindow,
    };
  }

  return {
    primary: `${fee}% fee — refund $${feeRefund.toFixed(2)}`,
  };
}

function blankRoomOffer(row?: AdminRequestRow): RoomOffer {
  return {
    roomType: row?.roomType ?? "Standard Room",
    board: (row?.mealPreference ?? "BREAKFAST") as MealValue,
    refundability: row?.refundabilityPreference ?? "FLEXIBLE",
    publicPrice: "",
    purplePrice: "",
    paymentLink: "",
    notes: "",
    freeCancellationUntil: null,
    cancellationFeePercent: null,
  };
}

type EmailWarningPayload = { _warning?: { email?: string | null } };

function stripWarning<T>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  delete copy._warning;
  return copy as T;
}

function notifyEmailWarning(payload: unknown, requestCode?: string) {
  const warning =
    (payload as EmailWarningPayload | null | undefined)?._warning?.email;
  if (!warning) return;
  toast.warning(
    requestCode ? `${requestCode} · ${warning}` : warning,
    {
      description:
        "The action saved successfully, but the member email did not send. Reach out manually or retry.",
      duration: 9000,
    },
  );
}

function freshDraft(row: AdminRequestRow): EditableState {
  return {
    offerMode: row.offerMode,
    requestedHotelName: row.requestedHotelName ?? "",
    publicPriceUsd: row.publicPriceUsd ?? "",
    purplePriceUsd: row.purplePriceUsd ?? "",
    requestedHotelOffers:
      row.requestedHotelOffers && row.requestedHotelOffers.length > 0
        ? row.requestedHotelOffers.map((o) => ({
            roomType: o.roomType ?? row.roomType ?? "Standard Room",
            board: (o.board ?? row.mealPreference ?? "BREAKFAST") as MealValue,
            refundability: (o.refundability as RefundabilityValue) ?? row.refundabilityPreference,
            publicPrice: o.publicPrice ?? "",
            purplePrice: o.purplePrice ?? "",
            paymentLink: o.paymentLink ?? "",
            notes: o.notes ?? "",
            freeCancellationUntil: o.freeCancellationUntil ?? null,
            cancellationFeePercent:
              typeof o.cancellationFeePercent === "number" ? o.cancellationFeePercent : null,
          }))
        : [blankRoomOffer(row)],
    alternativeOffers:
      row.alternativeOffers && row.alternativeOffers.length > 0
        ? row.alternativeOffers.map((alt) => ({
            ...alt,
            roomOffers:
              alt.roomOffers && alt.roomOffers.length > 0
                ? alt.roomOffers.map((o) => ({
                    roomType: o.roomType ?? row.roomType ?? "Standard Room",
                    board: (o.board ?? row.mealPreference ?? "BREAKFAST") as MealValue,
                    refundability:
                      (o.refundability as RefundabilityValue) ?? row.refundabilityPreference,
                    publicPrice: o.publicPrice ?? "",
                    purplePrice: o.purplePrice ?? "",
                    paymentLink: o.paymentLink ?? "",
                    notes: o.notes ?? "",
                    freeCancellationUntil: o.freeCancellationUntil ?? null,
                    cancellationFeePercent:
                      typeof o.cancellationFeePercent === "number" ? o.cancellationFeePercent : null,
                  }))
                : [],
          }))
        : [
            {
              hotelName: "",
              whyWePickedThis: "",
              bookingUrl: "",
              paymentLink: "",
              roomOffers: [blankRoomOffer(row)],
            },
          ],
    stripePaymentLink: row.stripePaymentLink ?? "",
    voucherUrl: row.voucherUrl ?? "",
    voucherFileName: row.voucherFileName ?? undefined,
    changeReply: row.agentChangeReply ?? "",
    changeStatus: "IN_PROGRESS",
    offerValidityHours: 24,
    cancelReason: "",
    cancelAgentNote: "",
    showCancelPanel: false,
    showPriorRound: false,
    refundTxSignature: "",
    refundAgentNote: "",
  };
}

function changeRequestLabel(status: ChangeRequestStatusValue) {
  switch (status) {
    case "OPEN":
      return "New";
    case "IN_PROGRESS":
      return "In progress";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Declined";
    default:
      return status;
  }
}

export default function TravelAdminPage() {
  const session = useWalletSession();
  const [requests, setRequests] = useState<AdminRequestRow[]>([]);
  const [edited, setEdited] = useState<Record<string, EditableState>>({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<FilterValue>("NEEDS_ATTENTION");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<Record<string, "summary" | "edit">>({});
  const [rejectPaymentDraft, setRejectPaymentDraft] = useState<Record<string, string>>({});
  // Tick once a minute so the "Received X min ago" labels stay fresh
  // for an agent who leaves the dashboard open between bookings.
  // 60s is generous enough that we don't waste re-renders, tight
  // enough that the relative-time labels never feel stale.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // When card payments are flagged off we hide every payment-link input
  // (per-room and alternative-room) and stop blocking Send Offer on
  // missing links. The server side mirrors this in
  // `validateRequestedOffersForSend` / `validateAlternativesForSend`.
  // Existing rows with a stored `paymentLink` keep that value; we just
  // don't surface or require it.
  const cardEnabled = cardPaymentsEnabled();

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/travel/admin/requests");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load requests.");
      }
      const rows = data.requests as AdminRequestRow[];
      setRequests(rows);
      setExpandedId((prev) => prev ?? rows[0]?.id ?? null);
      setEdited((prev) => {
        const next: Record<string, EditableState> = {};
        for (const row of rows) {
          next[row.id] = prev[row.id] ?? freshDraft(row);
        }
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests();
  }, [session.authenticated, session.isAdmin, loadRequests]);

  function updateField<K extends keyof EditableState>(
    id: string,
    field: K,
    value: EditableState[K],
  ) {
    setEdited((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  function updateRoomOfferField<K extends keyof RoomOffer>(
    id: string,
    index: number,
    field: K,
    value: RoomOffer[K],
  ) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.requestedHotelOffers];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, [id]: { ...existing, requestedHotelOffers: next } };
    });
  }

  function addRoomOffer(id: string, row: AdminRequestRow) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          requestedHotelOffers: [...existing.requestedHotelOffers, blankRoomOffer(row)],
        },
      };
    });
  }

  function removeRoomOffer(id: string, index: number) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing || existing.requestedHotelOffers.length <= 1) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          requestedHotelOffers: existing.requestedHotelOffers.filter((_, i) => i !== index),
        },
      };
    });
  }

  function updateAlternativeField(
    id: string,
    index: number,
    field: keyof AlternativeOffer,
    value: string,
  ) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.alternativeOffers];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, [id]: { ...existing, alternativeOffers: next } };
    });
  }

  /**
   * Tapping a "why we picked" chip appends the preset to the existing copy
   * (joined by " · ") rather than replacing it. This lets agents stack a
   * couple of reasons in one click while still being able to edit freely.
   * If the same preset is already present we no-op so we don't clutter.
   */
  function appendWhyPickedPreset(id: string, index: number, preset: string) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.alternativeOffers];
      const current = next[index]?.whyWePickedThis ?? "";
      if (current.toLowerCase().includes(preset.toLowerCase())) return prev;
      const merged = current.trim() ? `${current.trim()} · ${preset}` : preset;
      next[index] = { ...next[index], whyWePickedThis: merged };
      return { ...prev, [id]: { ...existing, alternativeOffers: next } };
    });
  }

  function addAlternative(id: string, row: AdminRequestRow) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing || existing.alternativeOffers.length >= 2) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          alternativeOffers: [
            ...existing.alternativeOffers,
            {
              hotelName: "",
              whyWePickedThis: "",
              bookingUrl: "",
              paymentLink: "",
              roomOffers: [blankRoomOffer(row)],
            },
          ],
        },
      };
    });
  }

  function updateAltRoomOfferField<K extends keyof RoomOffer>(
    id: string,
    altIndex: number,
    roomIndex: number,
    field: K,
    value: RoomOffer[K],
  ) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.alternativeOffers];
      const alt = next[altIndex];
      if (!alt) return prev;
      const rooms = [...(alt.roomOffers ?? [])];
      if (!rooms[roomIndex]) return prev;
      rooms[roomIndex] = { ...rooms[roomIndex], [field]: value };
      next[altIndex] = { ...alt, roomOffers: rooms };
      return { ...prev, [id]: { ...existing, alternativeOffers: next } };
    });
  }

  function addAltRoomOffer(id: string, altIndex: number, row: AdminRequestRow) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.alternativeOffers];
      const alt = next[altIndex];
      if (!alt) return prev;
      const rooms = [...(alt.roomOffers ?? []), blankRoomOffer(row)];
      next[altIndex] = { ...alt, roomOffers: rooms };
      return { ...prev, [id]: { ...existing, alternativeOffers: next } };
    });
  }

  function removeAltRoomOffer(id: string, altIndex: number, roomIndex: number) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const next = [...existing.alternativeOffers];
      const alt = next[altIndex];
      if (!alt || !alt.roomOffers || alt.roomOffers.length <= 1) return prev;
      const rooms = alt.roomOffers.filter((_, i) => i !== roomIndex);
      next[altIndex] = { ...alt, roomOffers: rooms };
      return { ...prev, [id]: { ...existing, alternativeOffers: next } };
    });
  }

  function removeAlternative(id: string, index: number) {
    setEdited((prev) => {
      const existing = prev[id];
      if (!existing || existing.alternativeOffers.length <= 1) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          alternativeOffers: existing.alternativeOffers.filter((_, i) => i !== index),
        },
      };
    });
  }

  async function uploadVoucherFile(id: string, file: File) {
    setActionLoading(`${id}:voucher_upload`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("requestId", id);
      const response = await fetch("/api/travel/admin/voucher-upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Voucher upload failed.");
      }
      setEdited((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          voucherUrl: data.voucherUrl,
          voucherFileName: data.voucherFileName,
        },
      }));
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                voucherUrl: data.voucherUrl,
                voucherFileName: data.voucherFileName,
              }
            : r,
        ),
      );
      toast.success("Voucher uploaded and attached to booking.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Voucher upload failed.";
      setMessage(text);
      toast.error(text);
    } finally {
      setActionLoading(null);
    }
  }

  async function runAction(event: FormEvent | null, id: string, action: AdminAction) {
    if (event) event.preventDefault();
    const payload = edited[id];
    if (!payload) return;

    setActionLoading(`${id}:${action}`);
    setMessage("");

    try {
      const sanitized = {
        offerMode: payload.offerMode,
        requestedHotelName: payload.requestedHotelName,
        publicPriceUsd: payload.publicPriceUsd,
        purplePriceUsd: payload.purplePriceUsd,
        stripePaymentLink: payload.stripePaymentLink,
        voucherUrl: payload.voucherUrl,
        voucherFileName: payload.voucherFileName ?? null,
        requestedHotelOffers:
          payload.offerMode === "REQUESTED_HOTEL" || payload.offerMode === "BOTH"
            ? payload.requestedHotelOffers
            : null,
        alternativeOffers:
          payload.offerMode === "ALTERNATIVES" || payload.offerMode === "BOTH"
            ? payload.alternativeOffers
            : null,
        offerValidityHours:
          action === "send_offer" ? payload.offerValidityHours ?? 24 : undefined,
      };
      const response = await fetch("/api/travel/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...sanitized }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Action failed.");
      }

      toast.success(
        action === "save_draft"
          ? `Draft saved for ${data.requestCode}`
          : action === "send_offer"
            ? `Offer sent · ${data.requestCode}`
            : action === "mark_payment_verified"
              ? `Payment verified · ${data.requestCode}`
              : action === "cancel_request"
                ? `Request cancelled · ${data.requestCode}`
                : action === "reject_payment"
                  ? `Payment claim cleared · ${data.requestCode}`
                  : `Booking confirmed · ${data.requestCode}`,
      );
      notifyEmailWarning(data, data.requestCode);
      const cleaned = stripWarning(data);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...cleaned } : r)));
      setEdited((prev) => ({ ...prev, [id]: freshDraft({ ...prev[id], ...cleaned } as AdminRequestRow) }));
    } catch (error) {
      const text = error instanceof Error ? error.message : "Action failed.";
      setMessage(text);
      toast.error(text);
    } finally {
      setActionLoading(null);
    }
  }

  async function runRejectPayment(id: string) {
    setActionLoading(`${id}:reject_payment`);
    setMessage("");
    try {
      const response = await fetch("/api/travel/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "reject_payment",
          paymentRejectReason: rejectPaymentDraft[id]?.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Action failed.");
      }
      toast.success(`Payment claim cleared · ${data.requestCode}`);
      notifyEmailWarning(data, data.requestCode);
      const cleaned = stripWarning(data);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...cleaned } : r)));
      setEdited((prev) => ({ ...prev, [id]: freshDraft({ ...prev[id], ...cleaned } as AdminRequestRow) }));
      setRejectPaymentDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Action failed.";
      setMessage(text);
      toast.error(text);
    } finally {
      setActionLoading(null);
    }
  }

  async function runAgentCancel(id: string) {
    const payload = edited[id];
    if (!payload) return;
    setActionLoading(`${id}:cancel_request`);
    try {
      const response = await fetch("/api/travel/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "cancel_request",
          cancelReason: payload.cancelReason,
          agentNote: payload.cancelAgentNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to cancel.");
      toast.success(`Cancelled · ${data.requestCode}`);
      notifyEmailWarning(data, data.requestCode);
      const cleaned = stripWarning(data);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...cleaned } : r)));
      setEdited((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          showCancelPanel: false,
          cancelReason: "",
          cancelAgentNote: "",
        },
      }));
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to cancel.";
      toast.error(text);
    } finally {
      setActionLoading(null);
    }
  }

  async function processRefund(id: string) {
    const payload = edited[id];
    if (!payload) return;
    const txSig = payload.refundTxSignature.trim();
    if (!txSig) {
      toast.error("Paste the refund tx signature (or Stripe refund ID) first.");
      return;
    }
    setActionLoading(`${id}:process_refund`);
    try {
      const response = await fetch("/api/travel/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "process_refund",
          refundTxSignature: txSig,
          agentNote: payload.refundAgentNote.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to mark refund processed.");
      toast.success(`Refund recorded · ${data.requestCode}`);
      notifyEmailWarning(data, data.requestCode);
      const cleaned = stripWarning(data);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...cleaned } : r)));
      setEdited((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          refundTxSignature: "",
          refundAgentNote: "",
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark refund processed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function respondChangeRequest(id: string) {
    const payload = edited[id];
    if (!payload) return;
    if (!payload.changeReply.trim()) {
      toast.error("Add a reply before responding.");
      return;
    }
    setActionLoading(`${id}:respond_change_request`);
    try {
      const response = await fetch("/api/travel/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "respond_change_request",
          agentChangeReply: payload.changeReply,
          changeRequestStatus: payload.changeStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to respond.");
      toast.success(`Change request updated · ${data.requestCode}`);
      notifyEmailWarning(data, data.requestCode);
      const cleaned = stripWarning(data);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...cleaned } : r)));
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to respond.";
      toast.error(text);
    } finally {
      setActionLoading(null);
    }
  }

  async function copyRequestSummary(row: AdminRequestRow, form: EditableState) {
    const decoded = decodeHotelUrl(row.hotelUrl);
    const hotelName = row.requestedHotelName || decoded.hotelName || "N/A";
    const dates = `${new Date(row.checkInDate).toLocaleDateString()} - ${new Date(row.checkOutDate).toLocaleDateString()}`;
    const firstOffer = form.requestedHotelOffers[0];
    const purplePrice =
      form.purplePriceUsd ||
      (firstOffer?.purplePrice ?? "") ||
      "N/A";
    const text = `Booking ID: ${row.requestCode}
Hotel: ${hotelName}
Dates: ${dates}
Guests: Adults ${row.occupancy}, Children ${row.childrenCount}, Infants ${row.infantsCount}
Purple Price: ${purplePrice}`;
    await navigator.clipboard.writeText(text);
    toast.success("Request summary copied for WhatsApp.");
  }

  function savingsHint(publicValue: string, purpleValue: string) {
    const pub = Number(publicValue);
    const pur = Number(purpleValue);
    if (Number.isNaN(pub) || Number.isNaN(pur) || pub <= 0) return "—";
    const pct = ((pub - pur) / pub) * 100;
    return `${pct.toFixed(1)}%`;
  }

  const attentionCount = useMemo(
    () => requests.filter((r) => requestNeedsAgentAction(r)).length,
    [requests],
  );

  /**
   * Per-status count of rows currently needing agent action. Drives the
   * yellow dot on each filter chip so an agent who's parked on one tab
   * still notices when work piles up in another bucket.
   */
  const attentionByStatus = useMemo(() => {
    const map: Partial<Record<RequestStatus, number>> = {};
    for (const r of requests) {
      if (!requestNeedsAgentAction(r)) continue;
      map[r.status] = (map[r.status] ?? 0) + 1;
    }
    return map;
  }, [requests]);

  const refundPendingCount = useMemo(
    () => requests.filter((r) => isRefundPending(r)).length,
    [requests],
  );

  const archiveCount = useMemo(
    // Refund-pending rows are excluded from Archive — they live in
    // their own queue until the cancellation is processed or rejected.
    () =>
      requests.filter(
        (r) => ARCHIVE_STATUSES.has(r.status) && !isRefundPending(r),
      ).length,
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const base = (() => {
      if (filter === "NEEDS_ATTENTION") {
        return requests.filter((r) => requestNeedsAgentAction(r));
      }
      if (filter === "REFUND_PENDING") {
        return requests.filter((r) => isRefundPending(r));
      }
      if (filter === "ARCHIVE") {
        // Mirror archiveCount: refund-pending rows belong to the Refund
        // queue, not Archive. Archive stays "no more work to do here".
        return requests.filter(
          (r) => ARCHIVE_STATUSES.has(r.status) && !isRefundPending(r),
        );
      }
      return requests.filter((r) => r.status === filter);
    })();
    const trimmed = searchQuery.trim().toLowerCase();
    const searched =
      trimmed.length > 0 && SEARCHABLE_FILTERS.has(filter)
        ? base.filter((row) => {
            const decoded = decodeHotelUrl(row.hotelUrl);
            const haystack: (string | null | undefined)[] = [
              row.requestCode,
              row.user?.email,
              row.wallet,
              row.requestedHotelName,
              decoded.hotelName,
              ...(row.bookingGuests?.map((g) => g.fullName) ?? []),
            ];
            return haystack.some((value) =>
              value ? value.toLowerCase().includes(trimmed) : false,
            );
          })
        : base;
    return [...searched].sort((a, b) => {
      const aNeeds = requestNeedsAgentAction(a) ? 1 : 0;
      const bNeeds = requestNeedsAgentAction(b) ? 1 : 0;
      return bNeeds - aNeeds;
    });
  }, [filter, requests, searchQuery]);

  const selectFilter = useCallback((next: FilterValue) => {
    setFilter(next);
    setSearchQuery("");
  }, []);

  const rowsForRender = useMemo(
    () =>
      filteredRequests.map((row) => ({
        row,
        form: edited[row.id],
      })),
    [filteredRequests, edited],
  );

  const gateMessage = !session.authenticated
    ? "Sign in with your admin wallet using the pill in the top-right."
    : !session.isAdmin
      ? "This wallet is not in the admin allowlist."
      : null;

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-25" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/18 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
              Agent Command Center
            </span>
            <h1 className="pt-serif mt-2 text-4xl font-semibold text-white sm:text-5xl">
              Concierge Desk
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="max-w-xl text-sm text-white/60">
                Review incoming requests, send offers, and verify payments from one console.
              </p>
              {attentionCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/45 bg-[#EAB308]/10 px-3 py-1 text-[11px] font-semibold text-[#FDE68A]">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                  {attentionCount === 1
                    ? "1 needs attention"
                    : `${attentionCount} need attention`}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session.isFounder ? (
              <>
                <Link
                  href="/admin/travel/campaigns"
                  className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
                >
                  Campaigns
                </Link>
                <Link
                  href="/admin/travel/gifts"
                  className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
                >
                  Gifting stats
                </Link>
                <Link
                  href="/admin/travel/burns"
                  className="rounded-full border border-[#7C3AED]/45 bg-[#7C3AED]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#DDD6FE] hover:bg-[#7C3AED]/25"
                >
                  Burns
                </Link>
              </>
            ) : null}
            <button
              className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/20"
              type="button"
              onClick={() => void loadRequests()}
            >
              Refresh
            </button>
          </div>
        </div>

        {gateMessage ? (
          <div className="pt-glass rounded-2xl p-6 text-sm text-white/70">{gateMessage}</div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => selectFilter("NEEDS_ATTENTION")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                  filter === "NEEDS_ATTENTION"
                    ? "bg-[#EAB308] text-black"
                    : "border border-[#EAB308]/45 bg-[#EAB308]/10 text-[#FDE68A] hover:bg-[#EAB308]/20"
                }`}
              >
                Needs attention
                {attentionCount > 0 ? (
                  <span
                    className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      filter === "NEEDS_ATTENTION"
                        ? "bg-black/15 text-black"
                        : "bg-[#EAB308]/30 text-[#FDE68A]"
                    }`}
                  >
                    {attentionCount}
                  </span>
                ) : null}
              </button>
              {statuses.map((status) => {
                const dotCount = attentionByStatus[status] ?? 0;
                const showDot = dotCount > 0 && filter !== status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => selectFilter(status)}
                    className={`relative rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                      filter === status
                        ? "bg-[#EAB308] text-black"
                        : "border border-white/15 text-white/60 hover:text-white"
                    }`}
                    title={
                      showDot
                        ? `${dotCount} ${dotCount === 1 ? "row needs" : "rows need"} attention`
                        : undefined
                    }
                  >
                    {statusLabel[status]}
                    {showDot ? (
                      <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2 animate-pulse rounded-full bg-[#FDE047] ring-2 ring-[#0A051A]" />
                    ) : null}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => selectFilter("REFUND_PENDING")}
                className={`relative rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                  filter === "REFUND_PENDING"
                    ? "bg-red-500/20 text-red-100"
                    : "border border-red-400/35 text-red-200/80 hover:text-red-100"
                }`}
                title="Cancelled bookings awaiting refund processing"
              >
                Refunds Pending
                {refundPendingCount > 0 ? (
                  <span
                    className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      filter === "REFUND_PENDING"
                        ? "bg-red-100 text-red-900"
                        : "bg-red-500/35 text-red-100"
                    }`}
                  >
                    {refundPendingCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => selectFilter("ARCHIVE")}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                  filter === "ARCHIVE"
                    ? "bg-white/15 text-white"
                    : "border border-white/10 text-white/45 hover:text-white/70"
                }`}
                title="Cancelled & expired requests (refund already processed or no refund needed)"
              >
                Archive
                {archiveCount > 0 ? (
                  <span className="ml-1.5 text-[10px] text-white/40">{archiveCount}</span>
                ) : null}
              </button>
            </div>

            {SEARCHABLE_FILTERS.has(filter) ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-white/40"
                  aria-hidden
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M13.5 13.5l-3-3" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    filter === "ARCHIVE"
                      ? "Search archive: code, email, guest, hotel, wallet…"
                      : "Search confirmed: code, email, guest, hotel, wallet…"
                  }
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/55 hover:text-white"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}

            {message ? (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {message}
              </p>
            ) : null}

            {loading ? (
              <p className="text-sm text-white/60">Loading requests…</p>
            ) : rowsForRender.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
                {searchQuery.trim() && SEARCHABLE_FILTERS.has(filter)
                  ? `No matches for "${searchQuery.trim()}".`
                  : filter === "NEEDS_ATTENTION"
                    ? requests.length === 0
                      ? "No travel requests yet."
                      : "Inbox zero — nothing currently needs your attention."
                    : filter === "REFUND_PENDING"
                      ? "No refunds pending. Cancelled bookings appear here until you process the refund."
                      : filter === "ARCHIVE"
                        ? "No archived requests yet."
                        : "No requests in this filter."}
              </div>
            ) : (
              <div className="space-y-4">
                {rowsForRender.map(({ row, form }) => {
                  if (!form) return null;
                  const isExpanded = expandedId === row.id;
                  const decoded = decodeHotelUrl(row.hotelUrl);
                  const hotelName =
                    row.requestedHotelName || decoded.hotelName || "Hotel name pending";
                  const flag = countryFlagEmoji(row.nationality);
                  const needsAction = requestNeedsAgentAction(row);
                  const reasonText = needsAction ? attentionReason(row) : "";
                  const missing: string[] = [];
                  const showRequestedForm =
                    form.offerMode === "REQUESTED_HOTEL" || form.offerMode === "BOTH";
                  const showAlternativesForm =
                    form.offerMode === "ALTERNATIVES" || form.offerMode === "BOTH";
                  if (showRequestedForm) {
                    if (
                      form.requestedHotelOffers.length < 1 ||
                      form.requestedHotelOffers.some(
                        (o) => !o.publicPrice || !o.purplePrice || !o.roomType,
                      )
                    ) {
                      missing.push("Room offers");
                    }
                    if (
                      cardEnabled &&
                      form.requestedHotelOffers.some((o) => !o.paymentLink?.trim())
                    ) {
                      missing.push("Payment link per room");
                    }
                  }
                  if (showAlternativesForm) {
                    if (
                      form.alternativeOffers.some(
                        (a) =>
                          !a.hotelName ||
                          !a.whyWePickedThis ||
                          !a.bookingUrl ||
                          (a.roomOffers && a.roomOffers.length > 0
                            ? a.roomOffers.some(
                                (r) => !r.roomType || !r.publicPrice || !r.purplePrice,
                              )
                            : !a.publicPrice || !a.purplePrice),
                      )
                    ) {
                      missing.push("Alternatives");
                    }
                    if (
                      cardEnabled &&
                      form.alternativeOffers.some((a) =>
                        a.roomOffers && a.roomOffers.length > 0
                          ? a.roomOffers.some((r) => !r.paymentLink?.trim())
                          : !a.paymentLink?.trim(),
                      )
                    ) {
                      missing.push("Alt payment link per room");
                    }
                  }
                  const hasOpenChange =
                    row.changeRequestStatus === "OPEN" ||
                    row.changeRequestStatus === "IN_PROGRESS";

                  const effectiveMode: "summary" | "edit" =
                    editorMode[row.id] ?? (row.status === "PENDING" ? "edit" : "summary");
                  const hasVoucher = Boolean(form.voucherFileName || form.voucherUrl);
                  const showVoucherBlock =
                    row.status === "PAYMENT_VERIFIED" || row.status === "CONFIRMED";

                  const selectedKey = row.selectedOfferKey;
                  const isReqSelected = (i: number) => selectedKey === `REQ_${i}`;
                  const isAltSelected = (i: number) =>
                    selectedKey === `ALT_${i}` || selectedKey?.startsWith(`ALT_${i}_R_`);
                  const isAltRoomSelected = (ai: number, ri: number) =>
                    selectedKey === `ALT_${ai}_R_${ri}`;

                  type FooterAction = {
                    action: AdminAction;
                    label: string;
                    loadingLabel: string;
                    primary: boolean;
                    disabled?: boolean;
                    disabledHint?: string;
                  };
                  let footerActions: FooterAction[] = [];
                  let nextStepText = "";
                  switch (row.status) {
                    case "PENDING":
                      footerActions = [
                        {
                          action: "send_offer",
                          label: "Send Offer",
                          loadingLabel: "Sending…",
                          primary: true,
                        },
                      ];
                      nextStepText = "Send the offer to the member";
                      break;
                    case "OFFER_READY":
                      footerActions = [
                        {
                          action: "send_offer",
                          label: "Re-send Offer",
                          loadingLabel: "Sending…",
                          primary: false,
                        },
                      ];
                      nextStepText = "Awaiting the member to pick an option and pay";
                      break;
                    case "OFFER_EXPIRED":
                      footerActions = [
                        {
                          action: "send_offer",
                          label: "Send fresh offer",
                          loadingLabel: "Sending…",
                          primary: true,
                        },
                      ];
                      nextStepText = "Offer expired — re-quote and send a fresh round";
                      break;
                    case "PAYMENT_SUBMITTED":
                      footerActions = [
                        {
                          action: "mark_payment_verified",
                          label: "Mark Payment Verified",
                          loadingLabel: "Verifying…",
                          primary: true,
                        },
                      ];
                      nextStepText = "Verify the payment received from the member";
                      break;
                    case "PAYMENT_VERIFIED":
                      footerActions = [
                        {
                          action: "mark_confirmed",
                          label: "Mark Confirmed",
                          loadingLabel: "Confirming…",
                          primary: true,
                          disabled: !hasVoucher,
                          disabledHint: "Upload the voucher PDF first.",
                        },
                      ];
                      nextStepText = hasVoucher
                        ? "Confirm the booking to deliver the voucher"
                        : "Upload the voucher PDF, then confirm";
                      break;
                    case "CONFIRMED":
                      footerActions = [];
                      nextStepText = "Booking complete. Voucher delivered.";
                      break;
                    case "CANCELLED":
                      footerActions = [];
                      nextStepText = row.cancellation?.status === "OPEN"
                        ? "Process the refund and mark the cancellation as resolved"
                        : "Negotiation closed.";
                      break;
                  }

                  const priorRound =
                    row.offerHistory && row.offerHistory.length > 0
                      ? row.offerHistory[row.offerHistory.length - 1]
                      : null;
                  const roundCount = (row.offerHistory?.length ?? 0) + 1;
                  const canCancel =
                    row.status !== "CANCELLED" && row.status !== "PAYMENT_SUBMITTED";

                  return (
                    <article
                      key={row.id}
                      className={`pt-glass overflow-hidden rounded-2xl transition ${
                        isExpanded ? "shadow-[0_0_55px_-10px_rgba(234,179,8,0.22)]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((prev) => (prev === row.id ? null : row.id))
                        }
                        className="block w-full px-6 py-4 text-left"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
                                needsAction
                                  ? "border border-[#FDE047]/60 bg-[#FDE047]/15 text-[#FDE047] shadow-[0_0_18px_rgba(253,224,71,0.35)]"
                                  : "border border-[#EAB308]/40 bg-[#EAB308]/10 text-[#FDE047]"
                              }`}
                            >
                              PT
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                  {row.requestCode}
                                </p>
                                {needsAction ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full border border-[#EAB308]/50 bg-[#EAB308]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#FDE68A]"
                                    title={reasonText}
                                  >
                                    <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#FDE047]" />
                                    Action needed
                                  </span>
                                ) : null}
                              </div>
                              <p className="pt-serif text-base font-semibold text-white">
                                {hotelName}
                              </p>
                              <p className="mt-0.5 text-[11px] text-white/55">
                                {new Date(row.checkInDate).toLocaleDateString()} →{" "}
                                {new Date(row.checkOutDate).toLocaleDateString()} ·{" "}
                                Adults {row.occupancy} · Kids {row.childrenCount} · Inf {row.infantsCount}
                              </p>
                              {(() => {
                                // Surface the request arrival time so the
                                // agent has SLA context without needing to
                                // expand the row. Hover reveals the full
                                // timestamp; the relative label drives
                                // triage-by-staleness.
                                const recv = formatReceivedAt(row.submittedAt, nowMs);
                                if (!recv) return null;
                                return (
                                  <p
                                    className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/40"
                                    title={recv.absolute}
                                  >
                                    Received {recv.absolute} ·{" "}
                                    <span className="text-white/55">{recv.relative}</span>
                                  </p>
                                );
                              })()}
                              {isRefundPending(row) ? (
                                // Refund-pending rows need the two most
                                // actionable facts on the collapsed card so
                                // the agent doesn't have to expand to triage:
                                // when the booking was cancelled (SLA clock)
                                // and how much is owed back.
                                <p className="mt-1 text-[11px] font-semibold text-red-200">
                                  Cancelled{" "}
                                  {row.cancellation?.requestedAt
                                    ? new Date(
                                        row.cancellation.requestedAt,
                                      ).toLocaleDateString()
                                    : row.cancelledAt
                                      ? new Date(row.cancelledAt).toLocaleDateString()
                                      : "—"}
                                  {row.cancellation?.refundAmountUsd ? (
                                    <>
                                      {" · Refund "}
                                      <span className="text-red-100">
                                        ${row.cancellation.refundAmountUsd}
                                      </span>
                                      {typeof row.cancellation.refundFeePercent ===
                                      "number"
                                        ? ` · fee ${row.cancellation.refundFeePercent}%`
                                        : ""}
                                    </>
                                  ) : null}
                                  {row.cancellation?.actor === "AGENT"
                                    ? " · by concierge"
                                    : row.cancellation?.actor === "MEMBER"
                                      ? " · by member"
                                      : ""}
                                </p>
                              ) : needsAction ? (
                                <p className="mt-1 text-[11px] text-[#FDE68A]/85">
                                  {reasonText}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {priorRound ? (
                              <span className="rounded-full border border-violet-300/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                Round {roundCount} · re-negotiated
                              </span>
                            ) : null}
                            {hasOpenChange ? (
                              <span className="rounded-full border border-orange-300/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                                Change request
                              </span>
                            ) : null}
                            {missing.length > 0 && row.status === "PENDING" ? (
                              <span className="rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                Missing: {missing.join(", ")}
                              </span>
                            ) : null}
                            <span
                              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                isRefundPending(row)
                                  ? "border-red-400/50 bg-red-500/15 text-red-100"
                                  : statusPillClass[row.status]
                              }`}
                            >
                              {isRefundPending(row)
                                ? "Refund Pending"
                                : statusLabel[row.status]}
                            </span>
                          </div>
                        </div>
                      </button>

                      {isExpanded ? (
                        <form
                          onSubmit={(event) => void runAction(event, row.id, "save_draft")}
                          className="border-t border-white/5 bg-[#0F0822]/70 px-6 py-6"
                        >
                          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                            <section className="space-y-3 rounded-2xl border border-white/5 bg-black/30 p-4 text-sm text-white/75">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                  Request Snapshot
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void copyRequestSummary(row, form)}
                                  className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/65 hover:text-white"
                                >
                                  Copy Summary
                                </button>
                              </div>
                              <div className="grid gap-1 text-xs">
                                <p>
                                  <span className="text-white/50">Hotel:</span> {hotelName}
                                  {decoded.hotelName ? (
                                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2 py-0.5 text-[10px] text-[#FDE68A]">
                                      🛡 Decoded
                                    </span>
                                  ) : null}
                                </p>
                                <p>
                                  <span className="text-white/50">Member:</span>{" "}
                                  <span className="font-mono text-[11px] text-[#FDE68A]">
                                    {row.wallet}
                                  </span>
                                </p>
                                <p>
                                  <span className="text-white/50">Email:</span>{" "}
                                  {row.user.email ?? "—"}
                                </p>
                                <p>
                                  <span className="text-white/50">Nationality:</span>{" "}
                                  {row.nationality
                                    ? `${flag ? `${flag} ` : ""}${getCountryName(row.nationality) ?? row.nationality}`
                                    : "—"}
                                </p>
                                <p>
                                  <span className="text-white/50">Meal preference:</span>{" "}
                                  {mealLabel(row.mealPreference)}
                                </p>
                                <p>
                                  <span className="text-white/50">Stay:</span>{" "}
                                  {new Date(row.checkInDate).toLocaleDateString()} →{" "}
                                  {new Date(row.checkOutDate).toLocaleDateString()}
                                </p>
                                <p>
                                  <span className="text-white/50">Room:</span> {row.roomType} ·{" "}
                                  {row.refundabilityPreference.replaceAll("_", " ")}
                                </p>
                                <p>
                                  <span className="text-white/50">Guests:</span>{" "}
                                  Adults {row.occupancy}, Children {row.childrenCount}, Infants {row.infantsCount}
                                </p>
                                {(() => {
                                  // Full timestamp + relative age in the
                                  // expanded view so the agent has the
                                  // exact moment the member submitted on
                                  // hand for support replies / SLA notes.
                                  const recv = formatReceivedAt(row.submittedAt, nowMs);
                                  if (!recv) return null;
                                  return (
                                    <p>
                                      <span className="text-white/50">Received:</span>{" "}
                                      {recv.absolute}{" "}
                                      <span className="text-white/45">({recv.relative})</span>
                                    </p>
                                  );
                                })()}
                                <a
                                  href={row.hotelUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#FDE68A] underline-offset-2 hover:underline"
                                >
                                  Open original listing ↗
                                </a>
                              </div>

                              {row.bookingGuests && row.bookingGuests.length > 0 ? (
                                <div className="mt-3 rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
                                  <p className="mb-2 text-[10px] uppercase tracking-widest text-white/50">
                                    Booking guests
                                  </p>
                                  <ul className="space-y-1">
                                    {row.bookingGuests.map((g, i) => (
                                      <li key={`${g.kind}-${g.index}-${i}`} className="text-white/80">
                                        <span className="text-white/45">
                                          {g.kind === "ADULT"
                                            ? `Adult ${g.index + 1}`
                                            : g.kind === "CHILD"
                                              ? `Child ${g.index + 1}`
                                              : `Infant ${g.index + 1}`}
                                          :
                                        </span>{" "}
                                        {g.fullName?.trim() ? g.fullName : "Name pending"}
                                        {g.kind === "CHILD" && typeof g.ageYears === "number"
                                          ? ` · ${g.ageYears}y`
                                          : ""}
                                        {g.kind === "INFANT" && typeof g.ageMonths === "number"
                                          ? ` · ${g.ageMonths}mo`
                                          : ""}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {row.status === "PAYMENT_SUBMITTED" || row.paymentMethod ? (
                                <div className="mt-3 rounded-xl border border-sky-300/30 bg-sky-500/10 p-3 text-xs text-sky-100">
                                  <p className="font-semibold text-sky-200">
                                    Payment reported by member
                                  </p>
                                  <p className="mt-1">
                                    Method:{" "}
                                    <span className="font-semibold">
                                      {row.paymentMethod ?? "—"}
                                    </span>
                                  </p>
                                  {row.paymentReference ? (
                                    <p className="mt-1 break-all">Ref: {row.paymentReference}</p>
                                  ) : null}
                                  {row.paymentNote ? (
                                    <p className="mt-1">Note: {row.paymentNote}</p>
                                  ) : null}
                                  {row.paymentSubmittedAt ? (
                                    <p className="mt-1 text-sky-300/70">
                                      {new Date(row.paymentSubmittedAt).toLocaleString()}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

                              {row.changeRequestStatus ? (
                                <div className="mt-3 rounded-xl border border-orange-300/30 bg-orange-500/10 p-3 text-xs text-orange-100">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-orange-200">
                                      Change request · {changeRequestLabel(row.changeRequestStatus)}
                                    </p>
                                    {row.changeRequestType ? (
                                      <span className="rounded-full border border-orange-300/40 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-orange-200">
                                        {row.changeRequestType}
                                      </span>
                                    ) : null}
                                  </div>
                                  {row.changeRequestNote ? (
                                    <p className="mt-1">
                                      <span className="text-orange-200/60">Member:</span>{" "}
                                      {row.changeRequestNote}
                                    </p>
                                  ) : null}
                                  {row.changeRequestOpenedAt ? (
                                    <p className="mt-1 text-orange-200/70">
                                      Opened {new Date(row.changeRequestOpenedAt).toLocaleString()}
                                    </p>
                                  ) : null}
                                  {row.agentChangeReply ? (
                                    <p className="mt-1">
                                      <span className="text-orange-200/60">Concierge:</span>{" "}
                                      {row.agentChangeReply}
                                    </p>
                                  ) : null}

                                  {hasOpenChange ? (
                                    <div className="mt-3 grid gap-2">
                                      <textarea
                                        className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                        rows={2}
                                        value={form.changeReply}
                                        onChange={(e) =>
                                          updateField(row.id, "changeReply", e.target.value)
                                        }
                                        placeholder="Reply to the member"
                                      />
                                      <div className="flex flex-wrap items-center gap-2">
                                        <select
                                          className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                          value={form.changeStatus}
                                          onChange={(e) =>
                                            updateField(
                                              row.id,
                                              "changeStatus",
                                              e.target.value as EditableState["changeStatus"],
                                            )
                                          }
                                        >
                                          <option value="IN_PROGRESS">Mark in progress</option>
                                          <option value="RESOLVED">Mark resolved</option>
                                          <option value="REJECTED">Decline</option>
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => void respondChangeRequest(row.id)}
                                          disabled={
                                            actionLoading === `${row.id}:respond_change_request`
                                          }
                                          className="rounded-full border border-orange-300/50 bg-orange-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-orange-100 hover:bg-orange-500/25 disabled:opacity-50"
                                        >
                                          {actionLoading === `${row.id}:respond_change_request`
                                            ? "Saving…"
                                            : "Save change request response"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </section>

                            <div className="space-y-4">
                              {effectiveMode === "summary" ? (
                                <section className="space-y-3 rounded-2xl border border-white/5 bg-black/30 p-4 text-sm text-white/80">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45">
                                      <span>Offer summary</span>
                                      <span className="rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FDE68A]">
                                        {offerModeLabel(form.offerMode)}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditorMode((prev) => ({ ...prev, [row.id]: "edit" }))
                                      }
                                      className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/65 hover:text-white"
                                    >
                                      Edit offer
                                    </button>
                                  </div>

                                  {form.offerMode === "REQUESTED_HOTEL" ||
                                  form.offerMode === "BOTH" ? (
                                    <div className="space-y-2">
                                      {form.offerMode === "BOTH" ? (
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                          Requested hotel
                                        </p>
                                      ) : null}
                                      <p className="pt-serif text-base font-semibold text-white">
                                        {form.requestedHotelName || hotelName}
                                      </p>
                                      {form.requestedHotelOffers.length === 0 ? (
                                        <p className="text-xs text-white/55">
                                          No room offers added yet.
                                        </p>
                                      ) : (
                                        <ul className="space-y-2">
                                          {form.requestedHotelOffers.map((offer, oi) => {
                                            const sel = isReqSelected(oi);
                                            const sav = savingsHint(offer.publicPrice, offer.purplePrice);
                                            return (
                                              <li
                                                key={`sum-req-${oi}`}
                                                className={`pt-offer-card rounded-xl p-3 text-xs ${
                                                  sel ? "pt-offer-card-selected" : ""
                                                }`}
                                              >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <p className="text-sm font-semibold text-white">
                                                    {offer.roomType || "Room"}
                                                  </p>
                                                  {sel ? (
                                                    <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                                      Selected by member
                                                    </span>
                                                  ) : null}
                                                </div>
                                                <p className="mt-1 text-[11px] text-white/55">
                                                  {mealLabel(offer.board)} ·{" "}
                                                  {offer.refundability.replaceAll("_", " ").toLowerCase()}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/75">
                                                  <span>
                                                    Public{" "}
                                                    <span className="text-white/90">
                                                      {offer.publicPrice ? `$${offer.publicPrice}` : "—"}
                                                    </span>
                                                  </span>
                                                  <span>
                                                    Purple{" "}
                                                    <span className="text-[#FDE047]">
                                                      {offer.purplePrice ? `$${offer.purplePrice}` : "—"}
                                                    </span>
                                                  </span>
                                                  {sav !== "—" ? (
                                                    <span className="pt-save-badge rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                                                      Save {sav}
                                                    </span>
                                                  ) : null}
                                                </div>
                                                {offer.notes ? (
                                                  <p className="mt-2 text-[11px] text-white/65">
                                                    {offer.notes}
                                                  </p>
                                                ) : null}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  ) : null}

                                  {form.offerMode === "ALTERNATIVES" ||
                                  form.offerMode === "BOTH" ? (
                                    <div className="space-y-3">
                                      {form.offerMode === "BOTH" ? (
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                          Curated alternatives
                                        </p>
                                      ) : null}
                                      {form.alternativeOffers.map((alt, ai) => {
                                        const altSel = isAltSelected(ai);
                                        return (
                                          <div
                                            key={`sum-alt-${ai}`}
                                            className={`pt-offer-card rounded-xl p-3 text-xs ${
                                              altSel ? "pt-offer-card-selected" : ""
                                            }`}
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <p className="pt-serif text-sm font-semibold text-white">
                                                {alt.hotelName || "Alternative"}
                                              </p>
                                              {altSel ? (
                                                <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                                  Selected by member
                                                </span>
                                              ) : null}
                                            </div>
                                            {alt.location ? (
                                              <p className="mt-0.5 text-[11px] text-white/55">
                                                {alt.location}
                                              </p>
                                            ) : null}

                                            {alt.roomOffers && alt.roomOffers.length > 0 ? (
                                              <ul className="mt-2 space-y-2">
                                                {alt.roomOffers.map((room, ri) => {
                                                  const rSel = isAltRoomSelected(ai, ri);
                                                  const sav = savingsHint(room.publicPrice, room.purplePrice);
                                                  return (
                                                    <li
                                                      key={`sum-alt-${ai}-r-${ri}`}
                                                      className={`pt-offer-card rounded-lg p-2 text-[11px] ${
                                                        rSel ? "pt-offer-card-selected" : ""
                                                      }`}
                                                    >
                                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs font-semibold text-white">
                                                          {room.roomType || "Room"}
                                                        </p>
                                                        {rSel ? (
                                                          <span className="rounded-full border border-[#EAB308]/60 bg-[#EAB308]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#FDE047]">
                                                            Selected by member
                                                          </span>
                                                        ) : null}
                                                      </div>
                                                      <p className="mt-0.5 text-white/55">
                                                        {mealLabel(room.board)} ·{" "}
                                                        {room.refundability.replaceAll("_", " ").toLowerCase()}
                                                      </p>
                                                      <div className="mt-1 flex flex-wrap items-center gap-3 text-white/75">
                                                        <span>
                                                          Public{" "}
                                                          <span className="text-white/90">
                                                            {room.publicPrice ? `$${room.publicPrice}` : "—"}
                                                          </span>
                                                        </span>
                                                        <span>
                                                          Purple{" "}
                                                          <span className="text-[#FDE047]">
                                                            {room.purplePrice ? `$${room.purplePrice}` : "—"}
                                                          </span>
                                                        </span>
                                                        {sav !== "—" ? (
                                                          <span className="pt-save-badge rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                                                            Save {sav}
                                                          </span>
                                                        ) : null}
                                                      </div>
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            ) : (
                                              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/75">
                                                <span>
                                                  Public{" "}
                                                  <span className="text-white/90">
                                                    {alt.publicPrice ? `$${alt.publicPrice}` : "—"}
                                                  </span>
                                                </span>
                                                <span>
                                                  Purple{" "}
                                                  <span className="text-[#FDE047]">
                                                    {alt.purplePrice ? `$${alt.purplePrice}` : "—"}
                                                  </span>
                                                </span>
                                              </div>
                                            )}

                                            {alt.whyWePickedThis ? (
                                              <p className="mt-2 rounded-lg bg-black/30 p-2 text-[11px] text-white/65">
                                                <span className="text-white/45">Why:</span>{" "}
                                                {alt.whyWePickedThis}
                                              </p>
                                            ) : null}
                                            {alt.bookingUrl ? (
                                              <a
                                                href={alt.bookingUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-2 inline-block text-[11px] text-[#FDE68A] underline-offset-2 hover:underline"
                                              >
                                                Open hotel listing ↗
                                              </a>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}

                                  {cardEnabled ? (
                                    <p className="text-[11px] text-white/55">
                                      Payment links are set on each room option (see edit mode).
                                    </p>
                                  ) : null}
                                </section>
                              ) : (
                            <section className="space-y-4 rounded-2xl border border-white/5 bg-black/30 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45">
                                  Offer Mode
                                </div>
                                {row.status !== "PENDING" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditorMode((prev) => ({ ...prev, [row.id]: "summary" }))
                                    }
                                    className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/65 hover:text-white"
                                  >
                                    Done editing
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {OFFER_MODE_OPTIONS.map(({ value, label }) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateField(row.id, "offerMode", value)}
                                    className={`rounded-full border px-3 py-1 font-semibold uppercase tracking-widest ${
                                      form.offerMode === value
                                        ? "border-[#EAB308]/60 bg-[#EAB308]/15 text-[#FDE047]"
                                        : "border-white/15 text-white/60 hover:text-white"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {form.offerMode === "BOTH" ? (
                                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
                                  Send the requested hotel quote together with curated alternatives.
                                  Both blocks below must be complete before the offer can go out.
                                </p>
                              ) : null}

                              {showRequestedForm ? (
                                <div className="space-y-3 text-xs">
                                  <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                                    Hotel name
                                    <input
                                      className="pt-input rounded-lg px-3 py-2 text-sm"
                                      value={form.requestedHotelName}
                                      onChange={(e) =>
                                        updateField(row.id, "requestedHotelName", e.target.value)
                                      }
                                      placeholder={decoded.hotelName ?? "Hotel name"}
                                    />
                                  </label>

                                  {form.requestedHotelOffers.map((offer, index) => (
                                    <div
                                      key={index}
                                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                                    >
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-widest text-white/50">
                                          Room offer {index + 1}
                                        </p>
                                        {form.requestedHotelOffers.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => removeRoomOffer(row.id, index)}
                                            className="text-[10px] text-white/50 hover:text-red-300"
                                          >
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                          Room type
                                          <input
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            value={offer.roomType}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "roomType",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="e.g. Deluxe Sea View"
                                          />
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                          Board
                                          <select
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            value={offer.board}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "board",
                                                e.target.value as MealValue,
                                              )
                                            }
                                          >
                                            {MEAL_OPTIONS.map((opt) => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                          Refundability
                                          <select
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            value={offer.refundability}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "refundability",
                                                e.target.value as RefundabilityValue,
                                              )
                                            }
                                          >
                                            <option value="FLEXIBLE">Flexible</option>
                                            <option value="REFUNDABLE">Refundable</option>
                                            <option value="NON_REFUNDABLE">Non-refundable</option>
                                          </select>
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                          <span className="flex items-center gap-1.5">
                                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/40" />
                                            Public price (USD)
                                          </span>
                                          <input
                                            className="pt-input rounded-lg border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
                                            value={offer.publicPrice}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "publicPrice",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="e.g. 450"
                                            inputMode="decimal"
                                          />
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-[#FDE68A]">
                                          <span className="flex items-center gap-1.5">
                                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#FDE047]" />
                                            Purple price (USD) <span className="text-[#FDE68A]/70">★</span>
                                          </span>
                                          <input
                                            className="pt-input rounded-lg border-[#EAB308]/40 bg-[#7C3AED]/15 px-2 py-1.5 text-xs font-semibold text-[#FDE047] placeholder:text-[#FDE68A]/35 focus:border-[#FDE047]/70 focus:bg-[#7C3AED]/25"
                                            value={offer.purplePrice}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "purplePrice",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="e.g. 320"
                                            inputMode="decimal"
                                          />
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                          Savings
                                          <input
                                            readOnly
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs text-emerald-300"
                                            value={savingsHint(offer.publicPrice, offer.purplePrice)}
                                          />
                                        </label>
                                        <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                          Notes (optional)
                                          <input
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            value={offer.notes}
                                            onChange={(e) =>
                                              updateRoomOfferField(
                                                row.id,
                                                index,
                                                "notes",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="e.g. high floor, late check-out"
                                          />
                                        </label>
                                        {cardEnabled ? (
                                          <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                            Payment link (Stripe / PayPal) *
                                            <input
                                              className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                              value={offer.paymentLink ?? ""}
                                              onChange={(e) =>
                                                updateRoomOfferField(
                                                  row.id,
                                                  index,
                                                  "paymentLink",
                                                  e.target.value,
                                                )
                                              }
                                              placeholder="https://… (amount for this room)"
                                              inputMode="url"
                                              autoComplete="off"
                                            />
                                            <span className="text-[10px] text-white/45">
                                              One link per room option — amount must match this line’s Purple price.
                                            </span>
                                          </label>
                                        ) : null}
                                        {offer.refundability === "REFUNDABLE" ? (
                                          <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-2 sm:col-span-3">
                                            <p className="text-[10px] uppercase tracking-widest text-emerald-200/80">
                                              Refundability policy
                                            </p>
                                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Free cancel until
                                                <input
                                                  type="date"
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={
                                                    offer.freeCancellationUntil
                                                      ? offer.freeCancellationUntil.slice(0, 10)
                                                      : ""
                                                  }
                                                  onChange={(e) =>
                                                    updateRoomOfferField(
                                                      row.id,
                                                      index,
                                                      "freeCancellationUntil",
                                                      e.target.value || null,
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Cancellation fee %
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={100}
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={
                                                    typeof offer.cancellationFeePercent === "number"
                                                      ? String(offer.cancellationFeePercent)
                                                      : ""
                                                  }
                                                  onChange={(e) => {
                                                    const v = e.target.value;
                                                    const n = v === "" ? null : Number(v);
                                                    updateRoomOfferField(
                                                      row.id,
                                                      index,
                                                      "cancellationFeePercent",
                                                      n === null || Number.isNaN(n) ? null : n,
                                                    );
                                                  }}
                                                  placeholder="e.g. 50"
                                                />
                                              </label>
                                              <div className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Refund preview
                                                <p className="rounded-lg border border-emerald-300/30 bg-black/30 px-2 py-1.5 text-xs text-emerald-200">
                                                  {renderRoomRefundPreview(offer).primary}
                                                  {renderRoomRefundPreview(offer).secondary ? (
                                                    <span className="mt-1 block text-emerald-200/80">
                                                      {renderRoomRefundPreview(offer).secondary}
                                                    </span>
                                                  ) : null}
                                                </p>
                                              </div>
                                            </div>
                                            <p className="mt-1 text-[10px] text-white/50">
                                              100% means non-refundable after that date.
                                            </p>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => addRoomOffer(row.id, row)}
                                    className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-white"
                                  >
                                    + Add room option
                                  </button>
                                </div>
                              ) : null}
                              {showAlternativesForm ? (
                                <div className="space-y-3">
                                  {form.offerMode === "BOTH" ? (
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                      Curated alternatives
                                    </p>
                                  ) : null}
                                  {form.alternativeOffers.map((alt, index) => (
                                    <div
                                      key={index}
                                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                                    >
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-widest text-white/50">
                                          Alternative {index + 1}
                                        </p>
                                        {form.alternativeOffers.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => removeAlternative(row.id, index)}
                                            className="text-[10px] text-white/50 hover:text-red-300"
                                          >
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <input
                                          className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                          value={alt.hotelName}
                                          onChange={(e) =>
                                            updateAlternativeField(
                                              row.id,
                                              index,
                                              "hotelName",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Hotel name *"
                                        />
                                        <input
                                          className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                          value={alt.location ?? ""}
                                          onChange={(e) =>
                                            updateAlternativeField(
                                              row.id,
                                              index,
                                              "location",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Location"
                                        />
                                        <div className="col-span-full grid gap-1">
                                          <input
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            value={alt.bookingUrl ?? ""}
                                            onChange={(e) =>
                                              updateAlternativeField(
                                                row.id,
                                                index,
                                                "bookingUrl",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="Booking URL *"
                                          />
                                          <span className="text-[10px] text-white/45">
                                            Mandatory so the member can browse the hotel.
                                          </span>
                                        </div>
                                        <div className="col-span-full grid gap-1.5">
                                          <div className="flex flex-wrap gap-1.5">
                                            {WHY_PICKED_PRESETS.map((preset) => (
                                              <button
                                                key={preset}
                                                type="button"
                                                onClick={() =>
                                                  appendWhyPickedPreset(row.id, index, preset)
                                                }
                                                className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/65 transition hover:border-[#FDE047]/50 hover:bg-[#7C3AED]/15 hover:text-[#FDE68A]"
                                              >
                                                + {preset}
                                              </button>
                                            ))}
                                          </div>
                                          <textarea
                                            className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                            rows={2}
                                            value={alt.whyWePickedThis}
                                            onChange={(e) =>
                                              updateAlternativeField(
                                                row.id,
                                                index,
                                                "whyWePickedThis",
                                                e.target.value,
                                              )
                                            }
                                            placeholder="Why we picked this * — tap a chip above to add a reason, edit freely."
                                          />
                                        </div>
                                      </div>

                                      <div className="mt-3 space-y-2">
                                        <p className="text-[10px] uppercase tracking-widest text-white/45">
                                          Room options for this alternative
                                        </p>
                                        {(alt.roomOffers ?? []).map((room, rIdx) => (
                                          <div
                                            key={`alt-${index}-room-${rIdx}`}
                                            className="rounded-lg border border-white/10 bg-black/30 p-2"
                                          >
                                            <div className="flex items-center justify-between">
                                              <p className="text-[10px] uppercase tracking-widest text-white/55">
                                                Room option {rIdx + 1}
                                              </p>
                                              {(alt.roomOffers ?? []).length > 1 ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeAltRoomOffer(row.id, index, rIdx)
                                                  }
                                                  className="text-[10px] text-white/50 hover:text-red-300"
                                                >
                                                  Remove
                                                </button>
                                              ) : null}
                                            </div>
                                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                                Room type
                                                <input
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={room.roomType}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "roomType",
                                                      e.target.value,
                                                    )
                                                  }
                                                  placeholder="e.g. Deluxe Room"
                                                />
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Board
                                                <select
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={room.board}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "board",
                                                      e.target.value as MealValue,
                                                    )
                                                  }
                                                >
                                                  {MEAL_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                      {opt.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Refundability
                                                <select
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={room.refundability}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "refundability",
                                                      e.target.value as RefundabilityValue,
                                                    )
                                                  }
                                                >
                                                  <option value="FLEXIBLE">Flexible</option>
                                                  <option value="REFUNDABLE">Refundable</option>
                                                  <option value="NON_REFUNDABLE">
                                                    Non-refundable
                                                  </option>
                                                </select>
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                <span className="flex items-center gap-1.5">
                                                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/40" />
                                                  Public price (USD)
                                                </span>
                                                <input
                                                  className="pt-input rounded-lg border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
                                                  value={room.publicPrice}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "publicPrice",
                                                      e.target.value,
                                                    )
                                                  }
                                                  inputMode="decimal"
                                                />
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-[#FDE68A]">
                                                <span className="flex items-center gap-1.5">
                                                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#FDE047]" />
                                                  Purple price (USD) <span className="text-[#FDE68A]/70">★</span>
                                                </span>
                                                <input
                                                  className="pt-input rounded-lg border-[#EAB308]/40 bg-[#7C3AED]/15 px-2 py-1.5 text-xs font-semibold text-[#FDE047] placeholder:text-[#FDE68A]/35 focus:border-[#FDE047]/70 focus:bg-[#7C3AED]/25"
                                                  value={room.purplePrice}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "purplePrice",
                                                      e.target.value,
                                                    )
                                                  }
                                                  inputMode="decimal"
                                                />
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                Savings
                                                <input
                                                  readOnly
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs text-emerald-300"
                                                  value={savingsHint(room.publicPrice, room.purplePrice)}
                                                />
                                              </label>
                                              <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                                Notes
                                                <input
                                                  className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                  value={room.notes}
                                                  onChange={(e) =>
                                                    updateAltRoomOfferField(
                                                      row.id,
                                                      index,
                                                      rIdx,
                                                      "notes",
                                                      e.target.value,
                                                    )
                                                  }
                                                  placeholder="Optional"
                                                />
                                              </label>
                                              {cardEnabled ? (
                                                <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55 sm:col-span-3">
                                                  Payment link (Stripe / PayPal) *
                                                  <input
                                                    className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                    value={room.paymentLink ?? ""}
                                                    onChange={(e) =>
                                                      updateAltRoomOfferField(
                                                        row.id,
                                                        index,
                                                        rIdx,
                                                        "paymentLink",
                                                        e.target.value,
                                                      )
                                                    }
                                                    placeholder="https://… (amount for this room)"
                                                    inputMode="url"
                                                    autoComplete="off"
                                                  />
                                                  <span className="text-[10px] text-white/45">
                                                    One link per room — amount must match this line’s Purple price.
                                                  </span>
                                                </label>
                                              ) : null}
                                              {room.refundability === "REFUNDABLE" ? (
                                                <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-2 sm:col-span-3">
                                                  <p className="text-[10px] uppercase tracking-widest text-emerald-200/80">
                                                    Refundability policy
                                                  </p>
                                                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                                    <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                      Free cancel until
                                                      <input
                                                        type="date"
                                                        className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                        value={
                                                          room.freeCancellationUntil
                                                            ? room.freeCancellationUntil.slice(0, 10)
                                                            : ""
                                                        }
                                                        onChange={(e) =>
                                                          updateAltRoomOfferField(
                                                            row.id,
                                                            index,
                                                            rIdx,
                                                            "freeCancellationUntil",
                                                            e.target.value || null,
                                                          )
                                                        }
                                                      />
                                                    </label>
                                                    <label className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                      Cancellation fee %
                                                      <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                                        value={
                                                          typeof room.cancellationFeePercent ===
                                                          "number"
                                                            ? String(room.cancellationFeePercent)
                                                            : ""
                                                        }
                                                        onChange={(e) => {
                                                          const v = e.target.value;
                                                          const n = v === "" ? null : Number(v);
                                                          updateAltRoomOfferField(
                                                            row.id,
                                                            index,
                                                            rIdx,
                                                            "cancellationFeePercent",
                                                            n === null || Number.isNaN(n) ? null : n,
                                                          );
                                                        }}
                                                        placeholder="e.g. 50"
                                                      />
                                                    </label>
                                                    <div className="grid gap-1 text-[10px] uppercase tracking-widest text-white/55">
                                                      Refund preview
                                                      <p className="rounded-lg border border-emerald-300/30 bg-black/30 px-2 py-1.5 text-xs text-emerald-200">
                                                        {renderRoomRefundPreview(room).primary}
                                                        {renderRoomRefundPreview(room).secondary ? (
                                                          <span className="mt-1 block text-emerald-200/80">
                                                            {renderRoomRefundPreview(room).secondary}
                                                          </span>
                                                        ) : null}
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => addAltRoomOffer(row.id, index, row)}
                                          className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-white"
                                        >
                                          + Add room option
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {form.alternativeOffers.length < 2 ? (
                                    <button
                                      type="button"
                                      onClick={() => addAlternative(row.id, row)}
                                      className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-white"
                                    >
                                      + Add Alternative
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="grid max-w-md gap-2 pt-2">
                                <label className="grid gap-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                                  Offer validity (hours)
                                  <input
                                    type="number"
                                    min={1}
                                    max={168}
                                    className="pt-input rounded-lg px-3 py-2 text-sm"
                                    value={form.offerValidityHours}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      updateField(
                                        row.id,
                                        "offerValidityHours",
                                        Number.isFinite(n) && n > 0 ? Math.min(168, Math.round(n)) : 24,
                                      );
                                    }}
                                  />
                                  <span className="text-[10px] text-white/45">
                                    Used when you tap Send Offer (default 24h).
                                    {cardEnabled
                                      ? " Payment links are set on each room row above."
                                      : ""}
                                  </span>
                                </label>
                              </div>
                            </section>
                              )}

                              {showVoucherBlock ? (
                                <section className="space-y-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/5 p-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                                      Voucher PDF
                                    </p>
                                    {actionLoading === `${row.id}:voucher_upload` ? (
                                      <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-200">
                                        Uploading…
                                      </span>
                                    ) : hasVoucher ? (
                                      <span className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-200">
                                        Uploaded
                                      </span>
                                    ) : (
                                      <span className="rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200">
                                        Required
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-white/60">
                                    Upload the voucher PDF, then click{" "}
                                    <span className="font-semibold text-white">Mark Confirmed</span>{" "}
                                    to deliver it to the member.
                                  </p>
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    disabled={actionLoading === `${row.id}:voucher_upload`}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        void uploadVoucherFile(row.id, file);
                                      }
                                      e.target.value = "";
                                    }}
                                    className="block w-full text-xs text-white/75 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[#EAB308]/15 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:tracking-widest file:text-[#FDE68A] disabled:opacity-60"
                                  />
                                  {form.voucherUrl ? (
                                    <a
                                      href={form.voucherUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] text-emerald-200 underline-offset-2 hover:underline"
                                    >
                                      ✓ {form.voucherFileName ?? "voucher.pdf"}
                                    </a>
                                  ) : null}
                                </section>
                              ) : null}
                            </div>
                          </div>

                          {priorRound ? (
                            <div className="mt-4 rounded-2xl border border-violet-300/30 bg-violet-500/5 p-4 text-xs text-violet-100">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-violet-200">
                                  Prior round · #{priorRound.round} (snapshot)
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdited((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...prev[row.id],
                                        showPriorRound: !prev[row.id]?.showPriorRound,
                                      },
                                    }))
                                  }
                                  className="rounded-full border border-violet-300/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-violet-100 hover:bg-violet-500/15"
                                >
                                  {form.showPriorRound ? "Hide" : "Show"}
                                </button>
                              </div>
                              {form.showPriorRound ? (
                                <div className="mt-3 grid gap-2 text-[11px] text-violet-100/85">
                                  <p>
                                    <span className="text-violet-200/70">Sent:</span>{" "}
                                    {priorRound.offerSentAt
                                      ? new Date(priorRound.offerSentAt).toLocaleString()
                                      : "—"}
                                  </p>
                                  <p>
                                    <span className="text-violet-200/70">Expired:</span>{" "}
                                    {priorRound.offerExpiresAt
                                      ? new Date(priorRound.offerExpiresAt).toLocaleString()
                                      : "—"}
                                  </p>
                                  <p>
                                    <span className="text-violet-200/70">Mode:</span>{" "}
                                    {offerModeLabel(priorRound.offerMode)}
                                  </p>
                                  <p>
                                    <span className="text-violet-200/70">Purple price:</span>{" "}
                                    {priorRound.purplePriceUsd
                                      ? `$${priorRound.purplePriceUsd}`
                                      : "—"}
                                  </p>
                                  {priorRound.requestedHotelOffers &&
                                  priorRound.requestedHotelOffers.length > 0 ? (
                                    <ul className="space-y-1">
                                      {priorRound.requestedHotelOffers.map((o, i) => (
                                        <li key={`prior-room-${i}`} className="text-violet-100/80">
                                          · {o.roomType || "Room"} — Public ${o.publicPrice ?? "—"} ·
                                          Purple ${o.purplePrice ?? "—"} · {o.refundability}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {priorRound.alternativeOffers &&
                                  priorRound.alternativeOffers.length > 0 ? (
                                    <ul className="space-y-1">
                                      {priorRound.alternativeOffers.map((alt, i) => (
                                        <li key={`prior-alt-${i}`} className="text-violet-100/80">
                                          · {alt.hotelName} — {alt.publicPrice ? `Public $${alt.publicPrice}` : ""}{" "}
                                          {alt.purplePrice ? `Purple $${alt.purplePrice}` : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {row.status === "CANCELLED" && row.cancellation ? (
                            <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4 text-xs text-white/75">
                              <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">
                                Cancellation
                              </p>
                              <div className="mt-2 grid gap-1.5">
                                <p>
                                  <span className="text-white/45">Kind:</span>{" "}
                                  {row.cancellation.kind === "REFUND_REQUESTED"
                                    ? "Post-payment — refund requested"
                                    : "Pre-payment"}
                                </p>
                                <p>
                                  <span className="text-white/45">Status:</span>{" "}
                                  {row.cancellation.status}
                                </p>
                                <p>
                                  <span className="text-white/45">Actor:</span>{" "}
                                  {row.cancellation.actor}
                                </p>
                                {row.cancellation.refundAmountUsd ? (
                                  <p>
                                    <span className="text-white/45">Refund:</span>{" "}
                                    ${row.cancellation.refundAmountUsd} · fee{" "}
                                    {row.cancellation.refundFeePercent ?? 0}%
                                  </p>
                                ) : null}
                                {row.cancellation.policySnapshot?.policySummary ? (
                                  <p>
                                    <span className="text-white/45">Policy:</span>{" "}
                                    {row.cancellation.policySnapshot.policySummary}
                                  </p>
                                ) : null}
                                {row.cancellation.reason ? (
                                  <p>
                                    <span className="text-white/45">Member reason:</span>{" "}
                                    {row.cancellation.reason}
                                  </p>
                                ) : null}
                                {row.cancellation.agentNote ? (
                                  <p>
                                    <span className="text-white/45">Agent note:</span>{" "}
                                    {row.cancellation.agentNote}
                                  </p>
                                ) : null}
                                <p className="text-white/45">
                                  Requested {new Date(row.cancellation.requestedAt).toLocaleString()}
                                  {row.cancellation.processedAt
                                    ? ` · processed ${new Date(row.cancellation.processedAt).toLocaleString()}`
                                    : ""}
                                </p>
                                {row.cancellation.refundTxSignature ? (
                                  <p className="break-all">
                                    <span className="text-white/45">Refund tx:</span>{" "}
                                    {row.paymentMethod === "USDC" ? (
                                      <a
                                        href={`https://solscan.io/tx/${row.cancellation.refundTxSignature}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-200 underline-offset-2 hover:underline"
                                      >
                                        {row.cancellation.refundTxSignature}
                                      </a>
                                    ) : (
                                      <span className="pt-ref-mono">
                                        {row.cancellation.refundTxSignature}
                                      </span>
                                    )}
                                  </p>
                                ) : null}
                                {row.cancellation.refundProcessedBy ? (
                                  <p>
                                    <span className="text-white/45">Processed by:</span>{" "}
                                    <span className="pt-ref-mono">
                                      {row.cancellation.refundProcessedBy}
                                    </span>
                                  </p>
                                ) : null}
                              </div>

                              {row.cancellation.kind === "REFUND_REQUESTED" &&
                              row.cancellation.status === "OPEN" ? (
                                <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-xs">
                                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                                    Process refund
                                  </p>
                                  <p className="mt-1 text-emerald-100/85">
                                    Sign the refund from the treasury wallet
                                    {row.paymentMethod === "USDC"
                                      ? " (Phantom / Solflare)"
                                      : " (Stripe dashboard)"}{" "}
                                    first, then paste the {row.paymentMethod === "USDC"
                                      ? "Solana tx signature"
                                      : "Stripe refund ID"}{" "}
                                    below to close the loop.
                                  </p>
                                  <div className="mt-3 grid gap-2">
                                    <label className="grid gap-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">
                                      {row.paymentMethod === "USDC"
                                        ? "Refund tx signature"
                                        : "Stripe refund ID"}
                                      <input
                                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-emerald-300/40"
                                        placeholder={
                                          row.paymentMethod === "USDC"
                                            ? "5h... (paste the Solscan tx signature)"
                                            : "re_..."
                                        }
                                        value={form.refundTxSignature ?? ""}
                                        onChange={(e) =>
                                          setEdited((prev) => ({
                                            ...prev,
                                            [row.id]: {
                                              ...prev[row.id],
                                              refundTxSignature: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">
                                      Agent note (optional)
                                      <textarea
                                        rows={2}
                                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-emerald-300/40"
                                        placeholder="Anything internal worth recording"
                                        value={form.refundAgentNote ?? ""}
                                        onChange={(e) =>
                                          setEdited((prev) => ({
                                            ...prev,
                                            [row.id]: {
                                              ...prev[row.id],
                                              refundAgentNote: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={
                                          actionLoading === `${row.id}:process_refund` ||
                                          !form.refundTxSignature?.trim()
                                        }
                                        onClick={() => void processRefund(row.id)}
                                        className="rounded-full bg-emerald-400/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {actionLoading === `${row.id}:process_refund`
                                          ? "Recording…"
                                          : "Mark refund processed"}
                                      </button>
                                      <span className="text-[10px] text-emerald-100/60">
                                        Member gets an email with the tx link.
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {canCancel ? (
                            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/5 p-4 text-xs text-rose-100/85">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-rose-200">
                                  Cancel request
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdited((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...prev[row.id],
                                        showCancelPanel: !prev[row.id]?.showCancelPanel,
                                      },
                                    }))
                                  }
                                  className="rounded-full border border-rose-300/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-rose-100 hover:bg-rose-500/15"
                                >
                                  {form.showCancelPanel ? "Hide" : "Open"}
                                </button>
                              </div>
                              {form.showCancelPanel ? (
                                <div className="mt-3 grid gap-2">
                                  {(() => {
                                    const isPostPayment =
                                      row.status === "PAYMENT_VERIFIED" ||
                                      row.status === "CONFIRMED";
                                    const refund = isPostPayment
                                      ? previewRefund(
                                          row.selectedOfferKey,
                                          form.requestedHotelOffers,
                                          form.alternativeOffers,
                                          form.purplePriceUsd,
                                        )
                                      : null;
                                    return (
                                      <>
                                        <p className="text-[11px] text-rose-100/75">
                                          {isPostPayment
                                            ? "Post-payment cancel — a refund task will be created and the member notified within 48h."
                                            : "Pre-payment cancel — instant. No refund needed."}
                                        </p>
                                        {refund ? (
                                          <div className="rounded-lg border border-rose-300/30 bg-black/30 p-2 text-[11px] text-rose-100">
                                            Refund preview: <strong>${refund.amountUsd}</strong> ·
                                            fee {refund.feePercent}% · {refund.policySummary}
                                          </div>
                                        ) : null}
                                        <textarea
                                          rows={2}
                                          className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                          placeholder="Reason shown to the member (optional)"
                                          value={form.cancelReason}
                                          onChange={(e) =>
                                            updateField(row.id, "cancelReason", e.target.value)
                                          }
                                        />
                                        <textarea
                                          rows={2}
                                          className="pt-input rounded-lg px-2 py-1.5 text-xs"
                                          placeholder="Internal note (optional)"
                                          value={form.cancelAgentNote}
                                          onChange={(e) =>
                                            updateField(row.id, "cancelAgentNote", e.target.value)
                                          }
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void runAgentCancel(row.id)}
                                          disabled={actionLoading === `${row.id}:cancel_request`}
                                          className="self-start rounded-full border border-rose-300/50 bg-rose-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
                                        >
                                          {actionLoading === `${row.id}:cancel_request`
                                            ? "Cancelling…"
                                            : "Confirm cancel request"}
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {row.status === "PAYMENT_SUBMITTED" ? (
                            <div className="mx-6 mt-4 rounded-xl border border-amber-300/30 bg-amber-500/10 p-4 text-xs text-amber-100">
                              <p className="font-semibold text-amber-200">
                                Reject payment claim
                              </p>
                              <p className="mt-1 text-[11px] text-amber-200/80">
                                If you cannot match the member’s payment, clear their submission so they can retry. The offer and guest details stay intact.
                              </p>
                              <label className="mt-3 grid gap-1 text-[10px] uppercase tracking-widest text-amber-200/90">
                                Reason (optional — e.g. not received, wrong amount, wrong reference)
                                <textarea
                                  className="pt-input rounded-lg px-2 py-1.5 text-xs text-white"
                                  rows={2}
                                  value={rejectPaymentDraft[row.id] ?? ""}
                                  onChange={(e) =>
                                    setRejectPaymentDraft((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void runRejectPayment(row.id)}
                                disabled={Boolean(actionLoading?.startsWith(row.id))}
                                className="mt-3 rounded-full border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                              >
                                {actionLoading === `${row.id}:reject_payment`
                                  ? "Clearing…"
                                  : "Reject payment claim"}
                              </button>
                            </div>
                          ) : null}

                          <div className="sticky -bottom-px -mx-6 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-[#0A051A]/95 px-6 py-4 backdrop-blur-xl">
                            <div className="flex flex-col gap-0.5">
                              <p className="text-[11px] text-white/55">
                                Current status:{" "}
                                <span className="font-semibold text-white">
                                  {statusLabel[row.status]}
                                </span>
                              </p>
                              {nextStepText ? (
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#FDE68A]">
                                  Next: {nextStepText}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="submit"
                                disabled={actionLoading?.startsWith(row.id)}
                                className="rounded-full border border-white/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/70 hover:text-white disabled:opacity-50"
                              >
                                {actionLoading === `${row.id}:save_draft` ? "Saving…" : "Save Draft"}
                              </button>
                              {footerActions.map((fa) => {
                                const loading = actionLoading === `${row.id}:${fa.action}`;
                                const baseClass = fa.primary
                                  ? "pt-cta-gold rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em]"
                                  : "rounded-full border border-white/15 bg-black/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/75 hover:text-white";
                                const disabled =
                                  Boolean(actionLoading?.startsWith(row.id)) ||
                                  Boolean(fa.disabled);
                                return (
                                  <div
                                    key={fa.action}
                                    className="flex flex-col items-end gap-0.5"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => void runAction(null, row.id, fa.action)}
                                      disabled={disabled}
                                      className={`${baseClass} disabled:opacity-50`}
                                      title={fa.disabled ? fa.disabledHint : undefined}
                                    >
                                      {loading ? fa.loadingLabel : fa.label}
                                    </button>
                                    {fa.disabled && fa.disabledHint ? (
                                      <span className="text-[9px] uppercase tracking-widest text-amber-200/80">
                                        {fa.disabledHint}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
