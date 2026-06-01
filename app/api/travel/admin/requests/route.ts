import {
  CancellationActor,
  CancellationKind,
  CancellationStatus,
  ChangeRequestStatus,
  MealPreference,
  OfferMode,
  Prisma,
  RefundabilityPreference,
  TravelRequestStatus,
} from "@prisma/client";
import { hasAdminConsoleAccess, readSession } from "@/lib/wallet-session";
import {
  dispatchNotification,
  memberEmailWarning,
  type NotificationEvent,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { computeRefund, DEFAULT_OFFER_VALIDITY_HOURS, isOfferExpired } from "@/lib/stay";
import { computeExpectedLamports, generateReferencePubkey } from "@/lib/usdc";
import { maskVoucher } from "@/lib/voucher";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

function withWarning<T extends object>(
  payload: T,
  warning: string | null,
): T | (T & { _warning: { email: string } }) {
  if (!warning) return payload;
  return { ...payload, _warning: { email: warning } };
}

export const runtime = "nodejs";

type AdminAction =
  | "save_draft"
  | "send_offer"
  | "mark_payment_verified"
  | "mark_confirmed"
  | "revert_to_pending"
  | "respond_change_request"
  | "cancel_request"
  | "process_refund"
  | "reject_payment";

type RoomOffer = {
  key: string;
  roomType: string;
  board: MealPreference;
  refundability: RefundabilityPreference;
  publicPrice: string | null;
  purplePrice: string | null;
  paymentLink?: string;
  notes: string | null;
  freeCancellationUntil: string | null;
  cancellationFeePercent: number | null;
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

type DraftPayload = {
  offerMode: OfferMode;
  requestedHotelName: string | null;
  publicPriceUsd: string | null;
  purplePriceUsd: string | null;
  requestedHotelOffers: unknown;
  alternativeOffers: unknown;
  stripePaymentLink: string | null;
  voucherUrl: string | null;
  voucherFileName: string | null;
  offerExpiresAt: string | null;
  offerValidityHours: number | null;
};

type ChangeResponsePayload = {
  agentChangeReply?: string;
  changeRequestStatus?: string;
};

type UpdatePayload = Partial<DraftPayload> &
  ChangeResponsePayload & {
    id: string;
    action?: AdminAction;
    triggerEmail?: boolean;
    cancelReason?: string;
    agentNote?: string;
    paymentRejectReason?: string;
    refundTxSignature?: string;
  };

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullablePrice(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return trimmed;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateRoomOfferList(
  value: unknown,
  label: string,
  keyPrefix: string,
): { valid: boolean; data: RoomOffer[] | null; message?: string } {
  if (!value) return { valid: true, data: null };
  if (!Array.isArray(value)) {
    return { valid: false, data: null, message: `${label} must be an array.` };
  }
  if (value.length < 1) {
    return { valid: true, data: null };
  }
  const allowedBoards = new Set<string>(Object.values(MealPreference));
  const allowedRefund = new Set<string>(Object.values(RefundabilityPreference));
  const cleaned: RoomOffer[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== "object") {
      return { valid: false, data: null, message: `${label} ${i + 1} is invalid.` };
    }
    const entry = item as Record<string, unknown>;
    const roomType = toNullableString(entry.roomType);
    if (!roomType) {
      return { valid: false, data: null, message: `${label} ${i + 1} requires a room type.` };
    }
    const board = String(entry.board ?? "BREAKFAST");
    if (!allowedBoards.has(board)) {
      return { valid: false, data: null, message: `${label} ${i + 1} has an invalid board.` };
    }
    const refundability = String(entry.refundability ?? "FLEXIBLE");
    if (!allowedRefund.has(refundability)) {
      return {
        valid: false,
        data: null,
        message: `${label} ${i + 1} has an invalid cancellation policy.`,
      };
    }
    const pub = toNullablePrice(entry.publicPrice);
    if (pub === undefined) {
      return { valid: false, data: null, message: `${label} ${i + 1}: invalid public price.` };
    }
    const pur = toNullablePrice(entry.purplePrice);
    if (pur === undefined) {
      return { valid: false, data: null, message: `${label} ${i + 1}: invalid purple price.` };
    }

    let freeUntilIso: string | null = null;
    let feePercent: number | null = null;

    if (refundability === RefundabilityPreference.REFUNDABLE) {
      const rawFreeUntil = toNullableString(entry.freeCancellationUntil);
      if (rawFreeUntil) {
        const parsed = new Date(rawFreeUntil);
        if (Number.isNaN(parsed.getTime())) {
          return {
            valid: false,
            data: null,
            message: `${label} ${i + 1}: free-cancellation-until must be a valid date.`,
          };
        }
        freeUntilIso = parsed.toISOString();
      }

      const rawFee = entry.cancellationFeePercent;
      if (rawFee !== undefined && rawFee !== null && rawFee !== "") {
        const num = Number(rawFee);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          return {
            valid: false,
            data: null,
            message: `${label} ${i + 1}: cancellation fee must be between 0 and 100.`,
          };
        }
        feePercent = Math.round(num);
      }
    }

    const plRaw = toNullableString(entry.paymentLink);
    let paymentLink: string | undefined;
    if (plRaw) {
      if (!isHttpUrl(plRaw)) {
        return {
          valid: false,
          data: null,
          message: `${label} ${i + 1}: payment link must be a valid http(s) URL.`,
        };
      }
      paymentLink = plRaw;
    }

    cleaned.push({
      key: `${keyPrefix}${i}`,
      roomType,
      board: board as MealPreference,
      refundability: refundability as RefundabilityPreference,
      publicPrice: pub,
      purplePrice: pur,
      paymentLink,
      notes: toNullableString(entry.notes),
      freeCancellationUntil: freeUntilIso,
      cancellationFeePercent: feePercent,
    });
  }
  return { valid: true, data: cleaned };
}

function validateRequestedOffers(value: unknown): {
  valid: boolean;
  data: RoomOffer[] | null;
  message?: string;
} {
  return validateRoomOfferList(value, "Room offer", "REQ_");
}

function validateAlternatives(value: unknown): {
  valid: boolean;
  data: AlternativeOffer[] | null;
  message?: string;
} {
  if (!value) return { valid: true, data: null };
  if (!Array.isArray(value)) {
    return { valid: false, data: null, message: "alternativeOffers must be an array." };
  }
  if (value.length < 1 || value.length > 2) {
    return {
      valid: false,
      data: null,
      message: "alternativeOffers must contain 1 or 2 hotels.",
    };
  }
  const normalized: AlternativeOffer[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== "object") {
      return { valid: false, data: null, message: `Alternative ${i + 1} is invalid.` };
    }
    const entry = item as Record<string, unknown>;
    const hotelName = toNullableString(entry.hotelName);
    const why = toNullableString(entry.whyWePickedThis);
    const url = toNullableString(entry.bookingUrl);
    if (!hotelName || !why) {
      return {
        valid: false,
        data: null,
        message: `Alternative ${i + 1}: hotel name and "why we picked" are required.`,
      };
    }
    if (!url || !isHttpUrl(url)) {
      return {
        valid: false,
        data: null,
        message: `Alternative ${i + 1}: a valid booking URL is required so the member can browse the hotel.`,
      };
    }

    const paymentLinkRaw = toNullableString(entry.paymentLink);
    let paymentLink: string | undefined;
    if (paymentLinkRaw) {
      if (!isHttpUrl(paymentLinkRaw)) {
        return {
          valid: false,
          data: null,
          message: `Alternative ${i + 1}: payment link must be a valid http(s) URL.`,
        };
      }
      paymentLink = paymentLinkRaw;
    }

    let roomOffers: RoomOffer[] | undefined;
    if (entry.roomOffers !== undefined && entry.roomOffers !== null) {
      const roomCheck = validateRoomOfferList(
        entry.roomOffers,
        `Alternative ${i + 1} room`,
        `ALT_${i}_R_`,
      );
      if (!roomCheck.valid) {
        return { valid: false, data: null, message: roomCheck.message };
      }
      if (roomCheck.data && roomCheck.data.length > 0) {
        roomOffers = roomCheck.data;
      }
    }

    normalized.push({
      hotelName,
      location: toNullableString(entry.location) ?? undefined,
      roomType: toNullableString(entry.roomType) ?? undefined,
      dates: toNullableString(entry.dates) ?? undefined,
      publicPrice: toNullableString(entry.publicPrice) ?? undefined,
      purplePrice: toNullableString(entry.purplePrice) ?? undefined,
      bookingUrl: url,
      paymentLink,
      whyWePickedThis: why,
      roomOffers,
    });
  }
  return { valid: true, data: normalized };
}

const ADMIN_SELECT = {
  id: true,
  requestCode: true,
  wallet: true,
  userId: true,
  hotelUrl: true,
  checkInDate: true,
  checkOutDate: true,
  refundabilityPreference: true,
  status: true,
  roomType: true,
  occupancy: true,
  childrenCount: true,
  infantsCount: true,
  nationality: true,
  mealPreference: true,
  submittedAt: true,
  updatedAt: true,
  publicPriceUsd: true,
  purplePriceUsd: true,
  offerMode: true,
  requestedHotelName: true,
  requestedHotelOffers: true,
  alternativeOffers: true,
  selectedOfferKey: true,
  bookingGuests: true,
  stripePaymentLink: true,
  voucherUrl: true,
  voucherFileName: true,
  voucherUploadedAt: true,
  paymentMethod: true,
  paymentReference: true,
  paymentNote: true,
  paymentSubmittedAt: true,
  paymentRejectReason: true,
  paymentTxSignature: true,
  changeRequestStatus: true,
  changeRequestType: true,
  changeRequestNote: true,
  changeRequestOpenedAt: true,
  changeRequestResolvedAt: true,
  agentChangeReply: true,
  offerSentAt: true,
  offerExpiresAt: true,
  offerHistory: true,
  cancelledAt: true,
  cancelReason: true,
  cancelActor: true,
  archivedAt: true,
  cancellation: {
    select: {
      id: true,
      kind: true,
      status: true,
      actor: true,
      reason: true,
      refundAmountUsd: true,
      refundFeePercent: true,
      policySnapshot: true,
      agentNote: true,
      refundTxSignature: true,
      refundProcessedBy: true,
      requestedAt: true,
      processedAt: true,
    },
  },
  user: {
    select: {
      email: true,
      hasUnlockedGifting: true,
    },
  },
} as const;

export async function GET() {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }
    if (!hasAdminConsoleAccess(session.wallet)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }

    const requests = await prisma.travelRequest.findMany({
      orderBy: { submittedAt: "desc" },
      select: ADMIN_SELECT,
    });

    const expiredIds = requests
      .filter((r) =>
        isOfferExpired({ status: r.status, offerExpiresAt: r.offerExpiresAt }),
      )
      .map((r) => r.id);
    if (expiredIds.length > 0) {
      await prisma.travelRequest.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: TravelRequestStatus.OFFER_EXPIRED },
      });
    }
    const refreshed = requests.map((r) =>
      maskVoucher(
        expiredIds.includes(r.id)
          ? { ...r, status: TravelRequestStatus.OFFER_EXPIRED }
          : r,
      ),
    );

    return Response.json({ requests: refreshed });
  } catch (error) {
    console.error("Failed to list admin requests:", error);
    return Response.json(
      { error: "Unable to load admin requests." },
      { status: 500 },
    );
  }
}

type DraftResolution = {
  data: Prisma.TravelRequestUpdateInput;
  requestedOffers: RoomOffer[] | null;
  alternatives: AlternativeOffer[] | null;
  error?: { message: string; field?: string };
};

function resolveDraftData(body: Partial<DraftPayload>): DraftResolution {
  const data: Prisma.TravelRequestUpdateInput = {};

  const nextOfferMode =
    typeof body.offerMode === "string" &&
    Object.values(OfferMode).includes(body.offerMode as OfferMode)
      ? (body.offerMode as OfferMode)
      : OfferMode.REQUESTED_HOTEL;
  data.offerMode = nextOfferMode;

  if ("requestedHotelName" in body) {
    data.requestedHotelName = toNullableString(body.requestedHotelName);
  }

  const nextPublic = toNullablePrice(body.publicPriceUsd);
  if (nextPublic === undefined) {
    return {
      data,
      requestedOffers: null,
      alternatives: null,
      error: { message: "publicPriceUsd must be a positive number.", field: "publicPriceUsd" },
    };
  }
  data.publicPriceUsd = nextPublic;

  const nextPurple = toNullablePrice(body.purplePriceUsd);
  if (nextPurple === undefined) {
    return {
      data,
      requestedOffers: null,
      alternatives: null,
      error: { message: "purplePriceUsd must be a positive number.", field: "purplePriceUsd" },
    };
  }
  data.purplePriceUsd = nextPurple;

  const wantsRequested =
    nextOfferMode === OfferMode.REQUESTED_HOTEL || nextOfferMode === OfferMode.BOTH;
  const wantsAlternatives =
    nextOfferMode === OfferMode.ALTERNATIVES || nextOfferMode === OfferMode.BOTH;

  let requestedOffers: RoomOffer[] | null = null;
  if (wantsRequested) {
    const offersValidation = validateRequestedOffers(body.requestedHotelOffers);
    if (!offersValidation.valid) {
      return {
        data,
        requestedOffers: null,
        alternatives: null,
        error: {
          message: offersValidation.message ?? "Invalid room offers.",
          field: "requestedHotelOffers",
        },
      };
    }
    requestedOffers = offersValidation.data;
    data.requestedHotelOffers = requestedOffers
      ? (requestedOffers as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  } else {
    data.requestedHotelOffers = Prisma.JsonNull;
  }

  let alternatives: AlternativeOffer[] | null = null;
  if (wantsAlternatives) {
    const alternativesValidation = validateAlternatives(body.alternativeOffers);
    if (!alternativesValidation.valid) {
      return {
        data,
        requestedOffers,
        alternatives: null,
        error: {
          message: alternativesValidation.message ?? "Invalid alternatives.",
          field: "alternativeOffers",
        },
      };
    }
    if (!alternativesValidation.data || alternativesValidation.data.length < 1) {
      return {
        data,
        requestedOffers,
        alternatives: null,
        error: {
          message:
            nextOfferMode === OfferMode.BOTH
              ? "Add at least one alternative hotel before sending."
              : "Alternatives mode requires 1 or 2 hotels.",
          field: "alternativeOffers",
        },
      };
    }
    alternatives = alternativesValidation.data;
    data.alternativeOffers = alternatives as unknown as Prisma.InputJsonValue;
  } else {
    data.alternativeOffers = Prisma.JsonNull;
  }

  if ("stripePaymentLink" in body) {
    data.stripePaymentLink = toNullableString(body.stripePaymentLink);
  }
  if ("voucherUrl" in body) {
    const next = toNullableString(body.voucherUrl);
    data.voucherUrl = next;
    if (next) {
      data.voucherUploadedAt = new Date();
    } else {
      data.voucherFileName = null;
      data.voucherUploadedAt = null;
    }
  }
  if ("voucherFileName" in body) {
    data.voucherFileName = toNullableString(body.voucherFileName);
  }

  return { data, requestedOffers, alternatives };
}

function resolveOfferExpiry(body: Partial<DraftPayload>): Date {
  const explicit = toNullableString(body.offerExpiresAt);
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const hours =
    typeof body.offerValidityHours === "number" && Number.isFinite(body.offerValidityHours)
      ? Math.max(1, Math.min(168, Math.round(body.offerValidityHours)))
      : DEFAULT_OFFER_VALIDITY_HOURS;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function validateRequestedOffersForSend(
  requestedOffers: RoomOffer[] | null,
): { ok: boolean; message?: string; field?: string } {
  if (!requestedOffers || requestedOffers.length < 1) {
    return {
      ok: false,
      message: "Add at least one room offer before sending.",
      field: "requestedHotelOffers",
    };
  }
  for (let i = 0; i < requestedOffers.length; i++) {
    const offer = requestedOffers[i];
    if (!offer.publicPrice || !offer.purplePrice) {
      return {
        ok: false,
        message: `Room offer ${i + 1} requires both public and purple prices.`,
        field: "requestedHotelOffers",
      };
    }
    // Card payments are reversibly disabled — when off we don't require
    // (or even surface) per-room payment links. Existing rows that still
    // have one stored aren't touched, just unused.
    if (cardPaymentsEnabled() && !offer.paymentLink) {
      return {
        ok: false,
        message: `Room offer ${i + 1}: add a payment link (Stripe / PayPal) for that room’s amount.`,
        field: "requestedHotelOffers",
      };
    }
  }
  return { ok: true };
}

function validateAlternativesForSend(
  alternatives: AlternativeOffer[] | null,
): { ok: boolean; message?: string; field?: string } {
  if (!alternatives || alternatives.length < 1) {
    return {
      ok: false,
      message: "Add at least one alternative before sending.",
      field: "alternativeOffers",
    };
  }
  // See above — when card is off, payment links are optional.
  const requirePaymentLink = cardPaymentsEnabled();
  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    const rooms = alt.roomOffers ?? [];
    if (rooms.length > 0) {
      for (let j = 0; j < rooms.length; j++) {
        if (requirePaymentLink && !rooms[j].paymentLink) {
          return {
            ok: false,
            message: `Alternative ${i + 1}, room ${j + 1}: add a payment link for that room’s amount.`,
            field: "alternativeOffers",
          };
        }
      }
    } else if (requirePaymentLink && !alt.paymentLink) {
      return {
        ok: false,
        message: `Alternative ${i + 1}: add room options with a payment link each, or one payment link on the alternative (legacy).`,
        field: "alternativeOffers",
      };
    }
  }
  return { ok: true };
}

function validateSendOfferGuards(
  _data: Prisma.TravelRequestUpdateInput,
  offerMode: OfferMode,
  requestedOffers: RoomOffer[] | null,
  alternatives: AlternativeOffer[] | null,
): { ok: boolean; message?: string; field?: string } {
  if (offerMode === OfferMode.REQUESTED_HOTEL) {
    return validateRequestedOffersForSend(requestedOffers);
  }
  if (offerMode === OfferMode.ALTERNATIVES) {
    return validateAlternativesForSend(alternatives);
  }
  // BOTH: requested + alternatives must both be ready.
  const requestedGuard = validateRequestedOffersForSend(requestedOffers);
  if (!requestedGuard.ok) return requestedGuard;
  return validateAlternativesForSend(alternatives);
}

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }
    if (!hasAdminConsoleAccess(session.wallet)) {
      return Response.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json()) as Partial<UpdatePayload>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return Response.json({ error: "id is required." }, { status: 400 });
    }

    const action: AdminAction = (body.action as AdminAction) ?? "save_draft";

    const existing = await prisma.travelRequest.findUnique({
      where: { id },
      select: {
        id: true,
        requestCode: true,
        status: true,
        voucherUrl: true,
        voucherFileName: true,
        offerMode: true,
        offerExpiresAt: true,
        changeRequestStatus: true,
        selectedOfferKey: true,
        purplePriceUsd: true,
        requestedHotelOffers: true,
        alternativeOffers: true,
        requestedHotelName: true,
        paymentMethod: true,
        cancellation: {
          select: {
            id: true,
            kind: true,
            status: true,
            agentNote: true,
            refundTxSignature: true,
            refundAmountUsd: true,
          },
        },
        user: { select: { email: true } },
      },
    });
    if (!existing) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    if (action === "cancel_request") {
      if (existing.status === TravelRequestStatus.CANCELLED) {
        return Response.json({ error: "Request is already cancelled." }, { status: 400 });
      }
      if (existing.status === TravelRequestStatus.PAYMENT_SUBMITTED) {
        return Response.json(
          {
            error:
              "Cancel is locked while payment verification is pending. Use Reject payment claim first, or mark payment verified.",
          },
          { status: 409 },
        );
      }
      const reason = toNullableString(body.cancelReason);
      const agentNote = toNullableString(body.agentNote);
      const isPostPayment =
        existing.status === TravelRequestStatus.PAYMENT_VERIFIED ||
        existing.status === TravelRequestStatus.CONFIRMED;

      const refund = isPostPayment
        ? computeRefund(
            existing.selectedOfferKey,
            existing.requestedHotelOffers,
            existing.alternativeOffers,
            existing.purplePriceUsd ?? null,
          )
        : null;

      const [updated] = await prisma.$transaction([
        prisma.travelRequest.update({
          where: { id },
          data: {
            status: TravelRequestStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: reason,
            cancelActor: CancellationActor.AGENT,
          },
          select: ADMIN_SELECT,
        }),
        prisma.cancellation.upsert({
          where: { travelRequestId: id },
          update: {
            kind: refund ? CancellationKind.REFUND_REQUESTED : CancellationKind.PRE_PAYMENT,
            status: refund ? CancellationStatus.OPEN : CancellationStatus.PROCESSED,
            actor: CancellationActor.AGENT,
            reason,
            agentNote,
            refundAmountUsd: refund?.amountUsd ?? null,
            refundFeePercent: refund?.feePercent ?? null,
            policySnapshot: refund
              ? ({
                  policySummary: refund.policySummary,
                  basePriceUsd: refund.basePriceUsd,
                  selectedOfferKey: existing.selectedOfferKey,
                } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            requestedAt: new Date(),
            processedAt: refund ? null : new Date(),
          },
          create: {
            travelRequestId: id,
            kind: refund ? CancellationKind.REFUND_REQUESTED : CancellationKind.PRE_PAYMENT,
            status: refund ? CancellationStatus.OPEN : CancellationStatus.PROCESSED,
            actor: CancellationActor.AGENT,
            reason,
            agentNote,
            refundAmountUsd: refund?.amountUsd ?? null,
            refundFeePercent: refund?.feePercent ?? null,
            policySnapshot: refund
              ? ({
                  policySummary: refund.policySummary,
                  basePriceUsd: refund.basePriceUsd,
                  selectedOfferKey: existing.selectedOfferKey,
                } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            processedAt: refund ? null : new Date(),
          },
        }),
      ]);

      const cancelDispatch = await dispatchNotification({
        event: refund ? "cancellation_refund_requested" : "cancel_pre_payment",
        member: { email: existing.user?.email ?? null },
        context: {
          requestCode: existing.requestCode,
          hotelName: existing.requestedHotelName,
          cancelReason: reason,
          // The agent pressed Cancel on the desk, so the member-facing
          // template needs to swap from "we received your cancellation"
          // to "concierge cancelled your booking".
          cancelActor: "AGENT",
          refundAmountUsd: refund?.amountUsd ?? null,
          refundFeePercent: refund?.feePercent ?? null,
          refundPolicySummary: refund?.policySummary ?? null,
        },
      });

      return Response.json(withWarning(maskVoucher(updated), memberEmailWarning(cancelDispatch)));
    }

    /**
     * Mark a REFUND_REQUESTED cancellation as processed once the agent has
     * actually moved the funds (USDC tx signed from the treasury wallet, or
     * Stripe refund pushed). Captures the on-chain / Stripe reference so
     * the audit trail is complete and the member sees a Solscan link on
     * their dashboard. Idempotent: re-submitting the same refund tx is a
     * no-op rather than an error so the agent can safely retry on flaky
     * networks.
     */
    if (action === "process_refund") {
      if (!existing.cancellation) {
        return Response.json(
          { error: "No cancellation record on this booking — open a cancel first." },
          { status: 400 },
        );
      }
      if (existing.cancellation.kind !== CancellationKind.REFUND_REQUESTED) {
        return Response.json(
          { error: "This cancellation is pre-payment — no refund to process." },
          { status: 400 },
        );
      }
      if (existing.cancellation.status === CancellationStatus.PROCESSED) {
        return Response.json(
          { error: "Refund is already marked processed." },
          { status: 400 },
        );
      }
      if (existing.cancellation.status === CancellationStatus.REJECTED) {
        return Response.json(
          { error: "Refund was rejected — cannot mark processed." },
          { status: 400 },
        );
      }

      const refundTxSignature = toNullableString(body.refundTxSignature);
      const processedAgentNote = toNullableString(body.agentNote);
      if (!refundTxSignature) {
        return Response.json(
          {
            error:
              "Refund transaction signature (or Stripe refund ID) is required.",
          },
          { status: 400 },
        );
      }
      if (refundTxSignature.length > 200) {
        return Response.json(
          { error: "Refund reference is too long." },
          { status: 400 },
        );
      }

      // Idempotent fast path: if the same tx is already on this cancellation,
      // just re-emit the success response. This is a read-only check; the
      // race-safe guard below covers the case where two writers both observe
      // refundTxSignature === null at the same instant.
      if (existing.cancellation.refundTxSignature === refundTxSignature) {
        const current = await prisma.travelRequest.findUniqueOrThrow({
          where: { id },
          select: ADMIN_SELECT,
        });
        return Response.json(maskVoucher(current));
      }

      const processedBy = session.wallet ?? null;
      const cancellationId = existing.cancellation.id;
      const fallbackAgentNote = existing.cancellation.agentNote;

      try {
        // Race-safe transition: only the writer that flips this OPEN
        // cancellation with a null refundTxSignature wins. Any concurrent
        // PATCH that observed the same null pre-state is harmlessly skipped
        // (count === 0), preventing duplicate `refund_processed` emails and
        // the "second agent's tx ID overwrites the first" data hazard.
        const claim = await prisma.cancellation.updateMany({
          where: {
            id: cancellationId,
            status: CancellationStatus.OPEN,
            refundTxSignature: null,
          },
          data: {
            status: CancellationStatus.PROCESSED,
            processedAt: new Date(),
            refundTxSignature,
            refundProcessedBy: processedBy,
            agentNote: processedAgentNote ?? fallbackAgentNote,
          },
        });

        if (claim.count === 0) {
          // Someone else (another agent / browser tab) processed this
          // cancellation between our pre-read and this write. Re-read to
          // decide whether it was the *same* tx (idempotent success) or a
          // different one (real conflict — surface a 409).
          const fresh = await prisma.cancellation.findUnique({
            where: { id: cancellationId },
            select: { status: true, refundTxSignature: true },
          });
          if (
            fresh?.status === CancellationStatus.PROCESSED &&
            fresh.refundTxSignature === refundTxSignature
          ) {
            const current = await prisma.travelRequest.findUniqueOrThrow({
              where: { id },
              select: ADMIN_SELECT,
            });
            return Response.json(maskVoucher(current));
          }
          return Response.json(
            {
              error:
                "Another agent just processed this refund. Refresh to see the updated state.",
            },
            { status: 409 },
          );
        }

        const updated = await prisma.travelRequest.findUniqueOrThrow({
          where: { id },
          select: ADMIN_SELECT,
        });

        const refundDispatch = await dispatchNotification({
          event: "refund_processed",
          member: { email: existing.user?.email ?? null },
          context: {
            requestCode: existing.requestCode,
            hotelName: existing.requestedHotelName,
            paymentMethod: existing.paymentMethod,
            refundAmountUsd: existing.cancellation.refundAmountUsd
              ? existing.cancellation.refundAmountUsd.toString()
              : null,
            refundTxSignature,
          },
        });

        return Response.json(
          withWarning(maskVoucher(updated), memberEmailWarning(refundDispatch)),
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return Response.json(
            {
              error:
                "That refund tx is already recorded against another cancellation.",
            },
            { status: 409 },
          );
        }
        throw error;
      }
    }

    if (action === "reject_payment") {
      if (existing.status !== TravelRequestStatus.PAYMENT_SUBMITTED) {
        return Response.json(
          {
            error: "Payment can only be rejected when the member has submitted a payment (pending verification).",
          },
          { status: 400 },
        );
      }
      const reason = toNullableString(body.paymentRejectReason);

      // If the original offer window has lapsed during verification we
      // can't honestly send the member back to OFFER_READY — the rate
      // wasn't held that long and the lazy-expiry pass on the dashboard
      // would just flip them to OFFER_EXPIRED on next load, which
      // contradicts the "retry payment" email. Detect that here and
      // park them in OFFER_EXPIRED so the email + dashboard agree, and
      // the member can request a fresh quote via the existing
      // "Re-negotiate rate" CTA on the expired card.
      const offerLapsed =
        existing.offerExpiresAt !== null &&
        existing.offerExpiresAt.getTime() <= Date.now();
      const nextStatus = offerLapsed
        ? TravelRequestStatus.OFFER_EXPIRED
        : TravelRequestStatus.OFFER_READY;

      const updated = await prisma.travelRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          paymentMethod: null,
          paymentReference: null,
          paymentNote: null,
          paymentSubmittedAt: null,
          paymentRejectReason: reason,
        },
        select: ADMIN_SELECT,
      });

      const rejectDispatch = await dispatchNotification({
        event: "payment_rejected",
        member: { email: updated.user?.email ?? null },
        context: {
          requestCode: updated.requestCode,
          hotelName: updated.requestedHotelName,
          offerExpiresAt: updated.offerExpiresAt
            ? updated.offerExpiresAt.toISOString()
            : null,
          paymentRejectReason: reason,
        },
      });

      return Response.json(withWarning(maskVoucher(updated), memberEmailWarning(rejectDispatch)));
    }

    if (action === "respond_change_request") {
      if (
        !existing.changeRequestStatus ||
        existing.changeRequestStatus === ChangeRequestStatus.RESOLVED ||
        existing.changeRequestStatus === ChangeRequestStatus.REJECTED
      ) {
        return Response.json(
          { error: "There is no open change request to respond to." },
          { status: 400 },
        );
      }
      const reply = toNullableString(body.agentChangeReply);
      const nextStatusRaw = String(body.changeRequestStatus ?? "");
      const allowed = new Set<string>([
        ChangeRequestStatus.IN_PROGRESS,
        ChangeRequestStatus.RESOLVED,
        ChangeRequestStatus.REJECTED,
      ]);
      if (!allowed.has(nextStatusRaw)) {
        return Response.json({ error: "Invalid change-request status." }, { status: 400 });
      }
      const nextStatus = nextStatusRaw as ChangeRequestStatus;
      const updated = await prisma.travelRequest.update({
        where: { id },
        data: {
          agentChangeReply: reply,
          changeRequestStatus: nextStatus,
          changeRequestResolvedAt:
            nextStatus === ChangeRequestStatus.RESOLVED ||
            nextStatus === ChangeRequestStatus.REJECTED
              ? new Date()
              : null,
        },
        select: ADMIN_SELECT,
      });

      let changeWarning: string | null = null;
      if (
        nextStatus === ChangeRequestStatus.RESOLVED ||
        nextStatus === ChangeRequestStatus.REJECTED
      ) {
        const changeDispatch = await dispatchNotification({
          event: "change_request_resolved",
          member: { email: updated.user?.email ?? null },
          context: {
            requestCode: updated.requestCode,
            hotelName: updated.requestedHotelName,
            changeRequestType: updated.changeRequestType,
            agentChangeReply: updated.agentChangeReply,
          },
        });
        changeWarning = memberEmailWarning(changeDispatch);
      }

      return Response.json(withWarning(maskVoucher(updated), changeWarning));
    }

    const { data, requestedOffers, alternatives, error } = resolveDraftData(body);
    if (error) {
      return Response.json({ error: error.message, field: error.field }, { status: 400 });
    }

    let dispatchEvent: NotificationEvent | null = null;

    switch (action) {
      case "save_draft": {
        break;
      }
      case "send_offer": {
        const guard = validateSendOfferGuards(
          data,
          (data.offerMode as OfferMode) ?? existing.offerMode,
          requestedOffers,
          alternatives,
        );
        if (!guard.ok) {
          return Response.json({ error: guard.message, field: guard.field }, { status: 400 });
        }
        data.status = TravelRequestStatus.OFFER_READY;
        data.offerSentAt = new Date();
        data.offerExpiresAt = resolveOfferExpiry(body);
        data.paymentRejectReason = null;
        // Reset any prior verification state on a fresh re-quote so the next
        // payment can be attached cleanly.
        data.paymentTxSignature = null;
        data.paymentVerifiedAt = null;
        data.paymentVerifiedAmountLamports = null;
        // Auto-stamp USDC invoice fields from env + the agreed Purple price.
        // Top-level `purplePriceUsd` is now optional (the per-room pricing UI
        // is the agent's source of truth), so we also fall back to whichever
        // room price exists. Multi-room cases are reconciled later when the
        // member picks a specific room — see `select_offer` in
        // [src/app/api/travel/requests/route.ts](purple-travel-app/src/app/api/travel/requests/route.ts).
        const pickPositive = (value: unknown): number | null => {
          if (typeof value !== "string" && typeof value !== "number") return null;
          const num = Number(value);
          return Number.isFinite(num) && num > 0 ? num : null;
        };
        let purpleNum: number | null =
          pickPositive(data.purplePriceUsd) ??
          pickPositive(existing.purplePriceUsd?.toString() ?? null);
        if (purpleNum === null) {
          const fromRequested = requestedOffers?.[0]?.purplePrice;
          const firstAlt = alternatives?.[0];
          const fromAltRoom = firstAlt?.roomOffers?.[0]?.purplePrice;
          const fromAlt = firstAlt?.purplePrice;
          purpleNum =
            pickPositive(fromRequested) ??
            pickPositive(fromAltRoom) ??
            pickPositive(fromAlt);
        }
        // Refuse to send the offer if no Purple price can be resolved
        // anywhere — top-level, requested room, alt-room, or alt
        // top-level. Without a price we'd ship a broken USDC invoice
        // (no expectedUsdcLamports), which silently breaks the on-chain
        // matcher and confuses the member at pay time. Better to fail
        // here so the agent fixes the offer before it ever reaches the
        // member's inbox.
        if (purpleNum === null) {
          return Response.json(
            {
              error:
                "Set a Purple price (per-room or top-level) before sending the offer — USDC payment can't be invoiced without it.",
              field: "purplePriceUsd",
            },
            { status: 400 },
          );
        }
        try {
          data.expectedUsdcLamports = computeExpectedLamports(
            purpleNum,
            existing.requestCode,
          );
        } catch (error) {
          console.error(
            "[admin/requests:send_offer] computeExpectedLamports threw:",
            error,
          );
          return Response.json(
            {
              error:
                "Could not compute the USDC invoice for this price. Double-check the Purple price and try again.",
              field: "purplePriceUsd",
            },
            { status: 400 },
          );
        }
        if (!data.paymentReferencePubkey) {
          data.paymentReferencePubkey = generateReferencePubkey();
        }
        const purpleStayWallet = process.env.PURPLE_STAY_WALLET?.trim();
        if (purpleStayWallet) {
          data.usdcPaymentAddress = purpleStayWallet;
        }
        dispatchEvent = "offer_ready";
        break;
      }
      case "mark_payment_verified": {
        data.status = TravelRequestStatus.PAYMENT_VERIFIED;
        data.paymentRejectReason = null;
        dispatchEvent = "payment_verified";
        break;
      }
      case "mark_confirmed": {
        if (!existing.voucherUrl && !existing.voucherFileName && !data.voucherUrl) {
          return Response.json(
            { error: "Upload a voucher PDF before confirming the booking.", field: "voucherUrl" },
            { status: 400 },
          );
        }
        data.status = TravelRequestStatus.CONFIRMED;
        dispatchEvent = "confirmed";
        break;
      }
      case "revert_to_pending": {
        data.status = TravelRequestStatus.PENDING;
        break;
      }
      default: {
        return Response.json({ error: "Unknown action." }, { status: 400 });
      }
    }

    const updated = await prisma.travelRequest.update({
      where: { id },
      data,
      select: ADMIN_SELECT,
    });

    if (
      action === "mark_payment_verified" || action === "mark_confirmed"
    ) {
      const user = await prisma.user.findUnique({
        where: { id: updated.userId ?? "" },
        select: { id: true, hasUnlockedGifting: true },
      }).catch(() => null);
      if (user && !user.hasUnlockedGifting) {
        await prisma.user.update({
          where: { id: user.id },
          data: { hasUnlockedGifting: true },
        });
        void dispatchNotification({
          event: "gift_unlocked",
          context: {
            requestCode: updated.requestCode,
            hotelName: updated.requestedHotelName,
          },
        });
      }
    }

    let mainWarning: string | null = null;
    if (dispatchEvent) {
      const mainDispatch = await dispatchNotification({
        event: dispatchEvent,
        member: { email: updated.user.email ?? null },
        context: {
          requestCode: updated.requestCode,
          hotelName: updated.requestedHotelName,
          offerMode: updated.offerMode,
          // Pass the payment method + on-chain signature so the agent
          // `payment_verified` template renders the USDC-specific copy
          // (Solscan link, "uploaded voucher" reminder) correctly. Without
          // these, manual mark_payment_verified actions fall back to the
          // generic Stripe-shaped agent email and show "-" for the tx.
          paymentMethod: updated.paymentMethod,
          paymentTxSignature: updated.paymentTxSignature,
        },
      });
      mainWarning = memberEmailWarning(mainDispatch);
    }

    return Response.json(withWarning(maskVoucher(updated), mainWarning));
  } catch (error) {
    console.error("Failed to update travel request:", error);
    return Response.json(
      { error: "Unable to update request." },
      { status: 500 },
    );
  }
}
