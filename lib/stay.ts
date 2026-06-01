import { Prisma, TravelRequestStatus } from "@prisma/client";

export type RoomOfferLike = {
  key?: string | null;
  refundability?: string | null;
  publicPrice?: string | null;
  purplePrice?: string | null;
  freeCancellationUntil?: string | null;
  cancellationFeePercent?: number | null;
};

export type AlternativeOfferLike = {
  bookingUrl?: string | null;
  publicPrice?: string | null;
  purplePrice?: string | null;
  roomOffers?: RoomOfferLike[] | null;
};

export type OfferHistoryEntry = {
  round: number;
  snapshotAt: string;
  offerMode: string;
  publicPriceUsd: string | null;
  purplePriceUsd: string | null;
  requestedHotelOffers: unknown;
  alternativeOffers: unknown;
  offerSentAt: string | null;
  offerExpiresAt: string | null;
  selectedOfferKey: string | null;
  stripePaymentLink: string | null;
};

export const DEFAULT_OFFER_VALIDITY_HOURS = 24;

export function isOfferExpired(record: {
  status: TravelRequestStatus;
  offerExpiresAt: Date | null;
}): boolean {
  if (record.status !== TravelRequestStatus.OFFER_READY) return false;
  if (!record.offerExpiresAt) return false;
  return record.offerExpiresAt.getTime() <= Date.now();
}

/**
 * Find the selected offer (room) given a key like REQ_0 or ALT_1_R_2.
 */
export function findSelectedRoom(
  selectedOfferKey: string | null | undefined,
  requestedHotelOffers: unknown,
  alternativeOffers: unknown,
): { room: RoomOfferLike | null; alternative: AlternativeOfferLike | null } {
  if (!selectedOfferKey) return { room: null, alternative: null };
  const match = selectedOfferKey.match(/^(REQ|ALT)_(\d+)(?:_R_(\d+))?$/);
  if (!match) return { room: null, alternative: null };
  const kind = match[1];
  const idx = Number(match[2]);
  const roomIdx = match[3] !== undefined ? Number(match[3]) : null;

  if (kind === "REQ") {
    if (!Array.isArray(requestedHotelOffers)) return { room: null, alternative: null };
    const room = requestedHotelOffers[idx] as RoomOfferLike | undefined;
    return { room: room ?? null, alternative: null };
  }
  if (!Array.isArray(alternativeOffers)) return { room: null, alternative: null };
  const alt = alternativeOffers[idx] as AlternativeOfferLike | undefined;
  if (!alt) return { room: null, alternative: null };
  if (roomIdx === null) return { room: null, alternative: alt };
  const rooms = Array.isArray(alt.roomOffers) ? alt.roomOffers : [];
  const room = rooms[roomIdx] as RoomOfferLike | undefined;
  return { room: room ?? null, alternative: alt };
}

export type RefundComputation = {
  amountUsd: string;
  feePercent: number;
  policySummary: string;
  basePriceUsd: string;
};

/**
 * Compute a refund preview based on the selected offer's policy.
 * - REFUNDABLE + free-cancel-window still open: 100% refund (fee 0%).
 * - REFUNDABLE + window passed: refund minus configured cancellationFeePercent.
 * - NON_REFUNDABLE / FLEXIBLE / unknown: defaults to 0% refund (member can still
 *   request — agent reviews).
 */
export function computeRefund(
  selectedOfferKey: string | null | undefined,
  requestedHotelOffers: unknown,
  alternativeOffers: unknown,
  fallbackPurplePrice: Prisma.Decimal | string | null | undefined,
): RefundComputation {
  const { room, alternative } = findSelectedRoom(
    selectedOfferKey,
    requestedHotelOffers,
    alternativeOffers,
  );

  const purpleRaw =
    room?.purplePrice ??
    alternative?.purplePrice ??
    (fallbackPurplePrice ? String(fallbackPurplePrice) : null);
  const basePrice = parseDecimal(purpleRaw);

  const refundability = (room?.refundability ?? "FLEXIBLE").toUpperCase();
  const feeConfigured =
    typeof room?.cancellationFeePercent === "number"
      ? clampPercent(room.cancellationFeePercent)
      : null;
  const freeUntil = room?.freeCancellationUntil
    ? new Date(room.freeCancellationUntil)
    : null;

  if (refundability === "REFUNDABLE") {
    if (freeUntil && !Number.isNaN(freeUntil.getTime()) && freeUntil.getTime() >= Date.now()) {
      return {
        amountUsd: basePrice.toFixed(2),
        feePercent: 0,
        policySummary: `Free cancellation until ${freeUntil.toISOString().slice(0, 10)} — 100% refund.`,
        basePriceUsd: basePrice.toFixed(2),
      };
    }
    const fee = feeConfigured ?? 100;
    const refundAmount = basePrice * (1 - fee / 100);
    return {
      amountUsd: Math.max(0, refundAmount).toFixed(2),
      feePercent: fee,
      policySummary: freeUntil
        ? `Free cancel window ended ${freeUntil.toISOString().slice(0, 10)} — ${fee}% cancellation fee applies.`
        : `${fee}% cancellation fee applies.`,
      basePriceUsd: basePrice.toFixed(2),
    };
  }

  // NON_REFUNDABLE or FLEXIBLE without explicit policy → 100% fee, agent decides.
  return {
    amountUsd: "0.00",
    feePercent: 100,
    policySummary:
      refundability === "NON_REFUNDABLE"
        ? "Non-refundable rate — concierge will check goodwill options with the supplier."
        : "Flexible rate — concierge will confirm the supplier's exact refund.",
    basePriceUsd: basePrice.toFixed(2),
  };
}

function parseDecimal(value: string | null | undefined): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 100;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

/**
 * Build a snapshot entry capturing the current active offer, intended to be
 * appended to `offerHistory` before clearing the active offer for renegotiation.
 */
export function buildHistorySnapshot(record: {
  offerMode: string;
  publicPriceUsd: Prisma.Decimal | string | null;
  purplePriceUsd: Prisma.Decimal | string | null;
  requestedHotelOffers: unknown;
  alternativeOffers: unknown;
  offerSentAt: Date | null;
  offerExpiresAt: Date | null;
  selectedOfferKey: string | null;
  stripePaymentLink: string | null;
  offerHistory: unknown;
}): OfferHistoryEntry {
  const priorRounds = Array.isArray(record.offerHistory) ? record.offerHistory.length : 0;
  return {
    round: priorRounds + 1,
    snapshotAt: new Date().toISOString(),
    offerMode: record.offerMode,
    publicPriceUsd: record.publicPriceUsd ? String(record.publicPriceUsd) : null,
    purplePriceUsd: record.purplePriceUsd ? String(record.purplePriceUsd) : null,
    requestedHotelOffers: record.requestedHotelOffers ?? null,
    alternativeOffers: record.alternativeOffers ?? null,
    offerSentAt: record.offerSentAt ? record.offerSentAt.toISOString() : null,
    offerExpiresAt: record.offerExpiresAt ? record.offerExpiresAt.toISOString() : null,
    selectedOfferKey: record.selectedOfferKey,
    stripePaymentLink: record.stripePaymentLink,
  };
}

export function appendHistory(
  prior: unknown,
  entry: OfferHistoryEntry,
): Prisma.InputJsonValue {
  const list = Array.isArray(prior) ? (prior as OfferHistoryEntry[]) : [];
  return [...list, entry] as unknown as Prisma.InputJsonValue;
}
