import crypto from "node:crypto";
import {
  CancellationActor,
  CancellationKind,
  CancellationStatus,
  ChangeRequestStatus,
  MealPreference,
  PaymentMethod,
  Prisma,
  RefundabilityPreference,
  TravelRequestStatus,
} from "@prisma/client";
import { hasAdminConsoleAccess, readSession } from "@/lib/wallet-session";
import { createTravelIssue } from "@/lib/github";
import { dispatchNotification, memberEmailWarning } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { decodeHotelUrl } from "@/lib/url-decoder";
import { isValidCountryCode } from "@/lib/countries";
import { isValidMeal } from "@/lib/meals";
import {
  appendHistory,
  buildHistorySnapshot,
  computeRefund,
  isOfferExpired,
} from "@/lib/stay";
import {
  computeExpectedLamports,
  generateReferencePubkey,
  verifyPaymentFromChain,
} from "@/lib/usdc";
import { maskVoucher } from "@/lib/voucher";
import { cardPaymentsEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

/**
 * Tag a successful response with a `_warning` field when an email failed
 * to send. Mirrors the admin route's helper so the dashboard can surface
 * "we couldn't reach your inbox" in the same format on either side.
 */
function withWarning<T extends object>(
  payload: T,
  warning: string | null,
): T | (T & { _warning: { email: string } }) {
  if (!warning) return payload;
  return { ...payload, _warning: { email: warning } };
}

// Anti-spam knobs. The cap counts pre-payment negotiations only; once a
// member submits payment we don't punish them for what is effectively the
// agent's queue. The duplicate cooldown stops accidental double-clicks on
// slow connections from creating ghost twins of the same request.
const ACTIVE_REQUEST_LIMIT = 3;
const DUPLICATE_COOLDOWN_MS = 10_000;

type TravelRequestPayload = {
  email: string;
  hotelUrl: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  occupancy: number;
  childrenCount?: number;
  infantsCount?: number;
  refundabilityPreference: RefundabilityPreference;
  mealPreference?: MealPreference;
  nationality?: string;
};

type SeedGuestRecord = {
  kind: "CHILD";
  index: number;
  fullName: string;
  ageYears: number;
};

const MEMBER_SELECT = {
  id: true,
  requestCode: true,
  wallet: true,
  status: true,
  roomType: true,
  occupancy: true,
  childrenCount: true,
  infantsCount: true,
  nationality: true,
  mealPreference: true,
  submittedAt: true,
  updatedAt: true,
  checkInDate: true,
  checkOutDate: true,
  refundabilityPreference: true,
  hotelUrl: true,
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
  usdcPaymentAddress: true,
  paymentMethod: true,
  paymentReference: true,
  paymentNote: true,
  paymentSubmittedAt: true,
  paymentRejectReason: true,
  expectedUsdcLamports: true,
  paymentReferencePubkey: true,
  paymentTxSignature: true,
  paymentVerifiedAt: true,
  paymentVerifiedAmountLamports: true,
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
      refundTxSignature: true,
      // Surface the agent's rejection note to the member so the dashboard's
      // "Refund declined" card can render the actual reason instead of a
      // generic message.
      agentNote: true,
      requestedAt: true,
      processedAt: true,
    },
  },
  githubIssueUrl: true,
} as const;

async function applyLazyExpiry<
  T extends {
    id: string;
    status: TravelRequestStatus;
    offerExpiresAt: Date | null;
  },
>(record: T): Promise<T> {
  if (!isOfferExpired(record)) return record;
  await prisma.travelRequest.update({
    where: { id: record.id },
    data: { status: TravelRequestStatus.OFFER_EXPIRED },
  });
  return { ...record, status: TravelRequestStatus.OFFER_EXPIRED };
}

/**
 * Convert any BigInt fields to strings for JSON serialization.
 *
 * Also respects custom `toJSON` methods on class instances. This matters
 * for Prisma `Decimal` (which is `decimal.js` under the hood): its
 * `toJSON` returns a string like `"123.45"`, but `Object.entries()` on
 * the same instance returns its INTERNAL `{ s, e, d }` representation.
 * Without this short-circuit, recursing into the generic object branch
 * below shreds the Decimal into `{ s, e, d }`, which then ships to the
 * client as an object. Any JSX that renders the value (e.g.
 * `formatMoney(refundAmountUsd)`) crashes with React error #31
 * ("Objects are not valid as a React child").
 *
 * Generalising over `toJSON` instead of specifically Decimal also
 * covers Buffer, Map (if it ever lands here), and any future Prisma
 * scalar that uses a class wrapper.
 */
function toJsonSafe<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item)) as unknown as T;
  }
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    typeof (value as unknown as { toJSON?: unknown }).toJSON === "function"
  ) {
    return toJsonSafe(
      (value as unknown as { toJSON: () => unknown }).toJSON(),
    ) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJsonSafe(v);
    }
    return out as unknown as T;
  }
  return value;
}

async function applyLazyExpiryMany<
  T extends {
    id: string;
    status: TravelRequestStatus;
    offerExpiresAt: Date | null;
  },
>(records: T[]): Promise<T[]> {
  const expiredIds = records
    .filter((r) => isOfferExpired(r))
    .map((r) => r.id);
  if (expiredIds.length > 0) {
    await prisma.travelRequest.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: TravelRequestStatus.OFFER_EXPIRED },
    });
  }
  return records.map((r) =>
    expiredIds.includes(r.id) ? { ...r, status: TravelRequestStatus.OFFER_EXPIRED } : r,
  );
}

type LazyUsdcRecord = {
  id: string;
  requestCode: string;
  status: TravelRequestStatus;
  selectedOfferKey: string | null;
  requestedHotelOffers: unknown;
  alternativeOffers: unknown;
  purplePriceUsd: Prisma.Decimal | string | null;
  expectedUsdcLamports: bigint | string | null;
  paymentReferencePubkey: string | null;
  usdcPaymentAddress: string | null;
};

/**
 * Self-heal USDC invoice fields for already-sent offers that landed with
 * `expectedUsdcLamports = null` because the agent priced per-room and left
 * the request-level Purple price blank. Runs on every read; does nothing
 * once the row is fully stamped, so it's effectively a one-time backfill.
 *
 * Only touches OFFER_READY rows (verified / confirmed rows are immutable
 * from the member's side).
 */
async function applyLazyUsdcInvoice<T extends LazyUsdcRecord>(record: T): Promise<T> {
  if (record.status !== TravelRequestStatus.OFFER_READY) return record;
  if (!record.selectedOfferKey) return record;
  if (
    record.expectedUsdcLamports != null &&
    record.paymentReferencePubkey &&
    record.usdcPaymentAddress
  ) {
    return record;
  }

  const purpleNum = resolveSelectedPurplePriceUsd(
    record.selectedOfferKey,
    record.requestedHotelOffers,
    record.alternativeOffers,
    typeof record.purplePriceUsd === "string"
      ? record.purplePriceUsd
      : record.purplePriceUsd?.toString() ?? null,
  );

  const patch: Prisma.TravelRequestUpdateInput = {};
  let nextLamports: bigint | null = null;
  if (purpleNum !== null && record.expectedUsdcLamports == null) {
    try {
      nextLamports = computeExpectedLamports(purpleNum, record.requestCode);
      patch.expectedUsdcLamports = nextLamports;
    } catch (error) {
      console.warn(
        "[applyLazyUsdcInvoice] could not compute expectedUsdcLamports:",
        error,
      );
    }
  }
  let nextReference: string | null = null;
  if (!record.paymentReferencePubkey) {
    nextReference = generateReferencePubkey();
    patch.paymentReferencePubkey = nextReference;
  }
  let nextAddress: string | null = null;
  if (!record.usdcPaymentAddress) {
    const treasury = process.env.PURPLE_STAY_WALLET?.trim();
    if (treasury) {
      nextAddress = treasury;
      patch.usdcPaymentAddress = treasury;
    }
  }

  if (Object.keys(patch).length === 0) return record;
  try {
    // The reference pubkey is the one non-deterministic field — every call
    // to generateReferencePubkey() produces a different random base58. Two
    // concurrent GETs that both observed paymentReferencePubkey = null
    // would otherwise both run this update with different references and
    // last-write-wins. We use a conditional updateMany to claim the slot
    // only if it's still null; the loser refetches the winner's value so
    // both responses reflect the same canonical reference. lamports and
    // address are deterministic (same inputs ⇒ same outputs) so they're
    // safe to overwrite idempotently.
    if (nextReference !== null) {
      const claim = await prisma.travelRequest.updateMany({
        where: { id: record.id, paymentReferencePubkey: null },
        data: { paymentReferencePubkey: nextReference },
      });
      if (claim.count === 0) {
        delete patch.paymentReferencePubkey;
        nextReference = null;
      }
    }
    if (Object.keys(patch).length > 0) {
      await prisma.travelRequest.update({
        where: { id: record.id },
        data: patch,
      });
    }
  } catch (error) {
    console.warn("[applyLazyUsdcInvoice] update failed:", error);
    return record;
  }
  // If we lost the reference race, re-read to surface the winner's value
  // rather than handing back stale `null` for this request cycle.
  let canonicalReference = nextReference ?? record.paymentReferencePubkey;
  if (canonicalReference === null) {
    try {
      const fresh = await prisma.travelRequest.findUnique({
        where: { id: record.id },
        select: { paymentReferencePubkey: true },
      });
      canonicalReference = fresh?.paymentReferencePubkey ?? null;
    } catch (error) {
      console.warn("[applyLazyUsdcInvoice] reference refetch failed:", error);
    }
  }
  return {
    ...record,
    expectedUsdcLamports: nextLamports ?? record.expectedUsdcLamports,
    paymentReferencePubkey: canonicalReference,
    usdcPaymentAddress: nextAddress ?? record.usdcPaymentAddress,
  };
}

async function applyLazyUsdcInvoiceMany<T extends LazyUsdcRecord>(records: T[]): Promise<T[]> {
  return Promise.all(records.map((r) => applyLazyUsdcInvoice(r)));
}

function buildRequestCode() {
  return `PTR-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function normalizePayload(body: TravelRequestPayload) {
  const nationalityRaw = typeof body.nationality === "string" ? body.nationality.trim().toUpperCase() : "";
  return {
    email: body.email?.trim().toLowerCase(),
    hotelUrl: body.hotelUrl?.trim(),
    roomType: body.roomType?.trim(),
    occupancy: Number(body.occupancy),
    childrenCount: Number(body.childrenCount ?? 0),
    infantsCount: Number(body.infantsCount ?? 0),
    checkInDate: body.checkInDate,
    checkOutDate: body.checkOutDate,
    refundabilityPreference: body.refundabilityPreference,
    mealPreference: (body.mealPreference ?? MealPreference.BREAKFAST) as MealPreference,
    nationality: nationalityRaw,
  };
}

function validatePayload(payload: ReturnType<typeof normalizePayload>) {
  const allowedRefundability = Object.values(RefundabilityPreference);
  if (
    !payload.email ||
    !payload.hotelUrl ||
    !payload.roomType ||
    !payload.checkInDate ||
    !payload.checkOutDate ||
    Number.isNaN(payload.occupancy) ||
    payload.occupancy < 1 ||
    Number.isNaN(payload.childrenCount) ||
    payload.childrenCount < 0 ||
    Number.isNaN(payload.infantsCount) ||
    payload.infantsCount < 0 ||
    !allowedRefundability.includes(payload.refundabilityPreference)
  ) {
    return "Missing or invalid fields.";
  }

  // URL sanity. The client's <input type="url" required> already
  // blocks plain text from a real browser, but anyone hitting the
  // API directly (curl, bots, mis-encoded redirects) can ship any
  // string. Reject the obvious junk so the concierge inbox doesn't
  // fill up with "potato" requests we'd have to manually purge.
  // We deliberately stay PERMISSIVE on the host — direct hotel
  // sites and unknown OTAs are legitimate even when our decoder
  // can't extract anything from them; that case shows an amber
  // warning on the form, not a hard rejection.
  if (payload.hotelUrl.length > 2000) {
    return "Hotel URL is too long.";
  }
  let parsedHotelUrl: URL;
  try {
    parsedHotelUrl = new URL(payload.hotelUrl);
  } catch {
    return "Hotel URL must be a valid web address (start with https://).";
  }
  if (
    parsedHotelUrl.protocol !== "https:" &&
    parsedHotelUrl.protocol !== "http:"
  ) {
    return "Hotel URL must start with https:// or http://.";
  }
  const host = parsedHotelUrl.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":") ||
    !host.includes(".")
  ) {
    return "Hotel URL must point to a public hotel listing.";
  }

  if (!isValidCountryCode(payload.nationality)) {
    return "Please select a valid nationality.";
  }

  if (!isValidMeal(payload.mealPreference)) {
    return "Please choose a valid meal preference.";
  }

  if (new Date(payload.checkInDate) >= new Date(payload.checkOutDate)) {
    return "Check-out date must be after check-in date.";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    // Server-side PBTC gate. The form UI hides the submit button when
    // pbtcEligible is false, but the API itself must enforce it independently
    // — a session can be minted for any valid wallet signature (so gift/invite
    // claim flows work for 0-PBTC wallets), and we don't want a stale UI
    // state, a direct API call, or a wallet whose balance dropped after
    // sign-in to slip a request past this gate.
    const isAdmin = hasAdminConsoleAccess(session.wallet);
    if (!isAdmin && session.pbtcBalance < 1) {
      return Response.json(
        {
          error:
            "Purple Club bookings require holding at least 1 PBTC. Top up your wallet and try again.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as TravelRequestPayload;
    const payload = normalizePayload(body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    // Anti-spam: cap concurrent active negotiations per wallet, and reject
    // duplicate submissions within a short cooldown window. Admin
    // wallets are exempt so we can stress-test the agent flow freely.
    if (!isAdmin) {
      const activeCount = await prisma.travelRequest.count({
        where: {
          wallet: session.wallet,
          status: {
            in: [TravelRequestStatus.PENDING, TravelRequestStatus.OFFER_READY],
          },
        },
      });
      if (activeCount >= ACTIVE_REQUEST_LIMIT) {
        return Response.json(
          {
            error: `You already have ${ACTIVE_REQUEST_LIMIT} requests waiting on a quote. Cancel or accept one of them before submitting a new request.`,
          },
          { status: 429 },
        );
      }

      const recentDuplicate = await prisma.travelRequest.findFirst({
        where: {
          wallet: session.wallet,
          hotelUrl: payload.hotelUrl,
          checkInDate: new Date(payload.checkInDate),
          checkOutDate: new Date(payload.checkOutDate),
          submittedAt: { gt: new Date(Date.now() - DUPLICATE_COOLDOWN_MS) },
        },
        select: { id: true },
      });
      if (recentDuplicate) {
        return Response.json(
          {
            error:
              "You just submitted this request — please give us a moment before resubmitting.",
          },
          { status: 429 },
        );
      }
    }

    const decoded = decodeHotelUrl(payload.hotelUrl);
    const seedBookingGuests: SeedGuestRecord[] = (decoded.childrenAges ?? [])
      .slice(0, payload.childrenCount)
      .map((age, index) => ({
        kind: "CHILD",
        index,
        fullName: "",
        ageYears: age,
      }));

    const user = await prisma.user.upsert({
      where: { wallet: session.wallet },
      update: { email: payload.email },
      create: {
        wallet: session.wallet,
        email: payload.email,
      },
    });

    const created = await prisma.travelRequest.create({
      data: {
        requestCode: buildRequestCode(),
        userId: user.id,
        wallet: session.wallet,
        hotelUrl: payload.hotelUrl,
        checkInDate: new Date(payload.checkInDate),
        checkOutDate: new Date(payload.checkOutDate),
        roomType: payload.roomType,
        occupancy: payload.occupancy,
        childrenCount: payload.childrenCount,
        infantsCount: payload.infantsCount,
        refundabilityPreference: payload.refundabilityPreference,
        mealPreference: payload.mealPreference,
        nationality: payload.nationality,
        status: TravelRequestStatus.PENDING,
        requestedHotelName: decoded.hotelName ?? null,
        bookingGuests:
          seedBookingGuests.length > 0
            ? (seedBookingGuests as unknown as Prisma.InputJsonValue)
            : undefined,
      },
      select: {
        id: true,
        requestCode: true,
        wallet: true,
        status: true,
        submittedAt: true,
      },
    });

    try {
      const issue = await createTravelIssue({
        requestCode: created.requestCode,
        wallet: session.wallet,
        hotelUrl: payload.hotelUrl,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        roomType: payload.roomType,
        occupancy: payload.occupancy,
        childrenCount: payload.childrenCount,
        infantsCount: payload.infantsCount,
        childrenAges: decoded.childrenAges,
        refundabilityPreference: payload.refundabilityPreference,
      });

      if (issue) {
        await prisma.travelRequest.update({
          where: { id: created.id },
          data: {
            githubIssueNumber: issue.issueNumber,
            githubIssueUrl: issue.issueUrl,
          },
        });
      }
    } catch (issueError) {
      console.error("GitHub issue creation error:", issueError);
    }

    void dispatchNotification({
      event: "request_received",
      member: { email: payload.email },
      context: {
        requestCode: created.requestCode,
        hotelName: decoded.hotelName ?? null,
      },
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create travel request:", error);
    return Response.json(
      { error: "Unable to create request at this time." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestCode = searchParams.get("requestCode");
    const wallet = searchParams.get("wallet");

    if (wallet) {
      if (wallet.trim() !== session.wallet) {
        return Response.json({ error: "Forbidden wallet scope." }, { status: 403 });
      }
      const includeArchived = searchParams.get("includeArchived") === "1";
      const requests = await prisma.travelRequest.findMany({
        where: {
          wallet: wallet.trim(),
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { submittedAt: "desc" },
        select: MEMBER_SELECT,
      });

      const expired = await applyLazyExpiryMany(requests);
      const healed = (await applyLazyUsdcInvoiceMany(expired)).map(maskVoucher);
      return Response.json({ requests: toJsonSafe(healed) });
    }

    if (!requestCode) {
      return Response.json(
        { error: "wallet or requestCode query parameter is required." },
        { status: 400 },
      );
    }

    const travelRequest = await prisma.travelRequest.findUnique({
      where: { requestCode },
      select: MEMBER_SELECT,
    });

    if (!travelRequest || travelRequest.wallet !== session.wallet) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    const expired = await applyLazyExpiry(travelRequest);
    const healed = await applyLazyUsdcInvoice(expired);
    return Response.json(toJsonSafe(maskVoucher(healed)));
  } catch (error) {
    console.error("Failed to load travel request:", error);
    return Response.json(
      { error: "Unable to load request at this time." },
      { status: 500 },
    );
  }
}

type MemberAction =
  | "select_offer"
  | "submit_payment"
  | "request_change_cancel"
  | "request_renegotiation"
  | "cancel_request"
  | "archive";

type GuestPayload = {
  kind?: string;
  index?: number;
  fullName?: string;
  ageYears?: number;
  ageMonths?: number;
};

type MemberActionPayload = {
  requestCode: string;
  action: MemberAction;
  selectedOfferKey?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paymentNote?: string;
  bookingGuests?: GuestPayload[];
  changeRequestType?: string;
  changeRequestNote?: string;
  cancelReason?: string;
};

const ALLOWED_CHANGE_TYPES = new Set(["DATES", "GUESTS", "OTHER"]);

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

function offerKeyExists(
  key: string,
  requestedHotelOffers: unknown,
  alternativeOffers: unknown,
): boolean {
  const parsed = parseOfferKey(key);
  if (!parsed) return false;
  if (parsed.kind === "REQ") {
    if (parsed.roomIndex !== null) return false;
    if (!Array.isArray(requestedHotelOffers)) return false;
    return parsed.index >= 0 && parsed.index < requestedHotelOffers.length;
  }
  if (!Array.isArray(alternativeOffers)) return false;
  if (parsed.index < 0 || parsed.index >= alternativeOffers.length) return false;
  if (parsed.roomIndex === null) return true;
  const alt = alternativeOffers[parsed.index] as { roomOffers?: unknown } | null;
  if (!alt || typeof alt !== "object") return false;
  const rooms = alt.roomOffers;
  if (!Array.isArray(rooms)) return false;
  return parsed.roomIndex >= 0 && parsed.roomIndex < rooms.length;
}

/**
 * Resolve the agreed Purple price (USD) for the offer the member just picked.
 *
 * Priority: the room's own purplePrice, then the alternative's headline
 * purplePrice (when no room is picked under it), then the request-level
 * fallback. This is what we use to compute the on-chain USDC invoice.
 */
function resolveSelectedPurplePriceUsd(
  key: string,
  requestedHotelOffers: unknown,
  alternativeOffers: unknown,
  fallbackPurpleUsd: string | null,
): number | null {
  const parsed = parseOfferKey(key);
  if (!parsed) return null;
  const pickPrice = (value: unknown): number | null => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  if (parsed.kind === "REQ") {
    if (!Array.isArray(requestedHotelOffers)) return pickPrice(fallbackPurpleUsd);
    const room = requestedHotelOffers[parsed.index] as
      | { purplePrice?: unknown }
      | undefined;
    return pickPrice(room?.purplePrice) ?? pickPrice(fallbackPurpleUsd);
  }

  if (!Array.isArray(alternativeOffers)) return pickPrice(fallbackPurpleUsd);
  const alt = alternativeOffers[parsed.index] as
    | { purplePrice?: unknown; roomOffers?: unknown }
    | undefined;
  if (!alt) return pickPrice(fallbackPurpleUsd);

  if (parsed.roomIndex !== null && Array.isArray(alt.roomOffers)) {
    const room = alt.roomOffers[parsed.roomIndex] as
      | { purplePrice?: unknown }
      | undefined;
    const fromRoom = pickPrice(room?.purplePrice);
    if (fromRoom !== null) return fromRoom;
  }
  return pickPrice(alt.purplePrice) ?? pickPrice(fallbackPurpleUsd);
}

function validateGuests(
  guests: GuestPayload[] | undefined,
  expected: { adults: number; children: number; infants: number },
): { ok: true; data: Prisma.InputJsonValue } | { ok: false; message: string } {
  if (!Array.isArray(guests)) {
    return { ok: false, message: "Guest names are required." };
  }

  const adults = guests.filter((g) => g.kind === "ADULT");
  const children = guests.filter((g) => g.kind === "CHILD");
  const infants = guests.filter((g) => g.kind === "INFANT");

  if (adults.length !== expected.adults) {
    return { ok: false, message: `Expected ${expected.adults} adult name(s).` };
  }
  if (children.length !== expected.children) {
    return { ok: false, message: `Expected ${expected.children} child name(s).` };
  }
  if (infants.length !== expected.infants) {
    return { ok: false, message: `Expected ${expected.infants} infant name(s).` };
  }

  const cleaned: GuestPayload[] = [];
  for (let i = 0; i < adults.length; i++) {
    const name = adults[i].fullName?.trim();
    if (!name) return { ok: false, message: `Adult ${i + 1} requires a full name.` };
    cleaned.push({ kind: "ADULT", index: i, fullName: name });
  }
  for (let i = 0; i < children.length; i++) {
    const name = children[i].fullName?.trim();
    const age = Number(children[i].ageYears);
    if (!name) return { ok: false, message: `Child ${i + 1} requires a full name.` };
    if (!Number.isFinite(age) || age < 0 || age > 17) {
      return { ok: false, message: `Child ${i + 1} requires an age between 0 and 17.` };
    }
    cleaned.push({ kind: "CHILD", index: i, fullName: name, ageYears: age });
  }
  for (let i = 0; i < infants.length; i++) {
    const name = infants[i].fullName?.trim();
    const age = Number(infants[i].ageMonths);
    if (!name) return { ok: false, message: `Infant ${i + 1} requires a full name.` };
    if (!Number.isFinite(age) || age < 0 || age > 23) {
      return { ok: false, message: `Infant ${i + 1} requires an age between 0 and 23 months.` };
    }
    cleaned.push({ kind: "INFANT", index: i, fullName: name, ageMonths: age });
  }

  return { ok: true, data: cleaned as unknown as Prisma.InputJsonValue };
}

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    const body = (await request.json()) as MemberActionPayload;
    const requestCode = body.requestCode?.trim();
    const action = body.action;

    if (!requestCode || !action) {
      return Response.json(
        { error: "requestCode and action are required." },
        { status: 400 },
      );
    }

    const found = await prisma.travelRequest.findUnique({
      where: { requestCode },
      select: {
        id: true,
        requestCode: true,
        wallet: true,
        status: true,
        offerMode: true,
        occupancy: true,
        childrenCount: true,
        infantsCount: true,
        publicPriceUsd: true,
        purplePriceUsd: true,
        requestedHotelName: true,
        requestedHotelOffers: true,
        alternativeOffers: true,
        selectedOfferKey: true,
        changeRequestStatus: true,
        offerSentAt: true,
        offerExpiresAt: true,
        offerHistory: true,
        stripePaymentLink: true,
        archivedAt: true,
        expectedUsdcLamports: true,
        usdcPaymentAddress: true,
        paymentReferencePubkey: true,
        user: { select: { email: true } },
      },
    });

    if (!found || found.wallet !== session.wallet) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    const existing = await applyLazyExpiry(found);

    if (action === "select_offer") {
      const key = typeof body.selectedOfferKey === "string" ? body.selectedOfferKey.trim() : "";
      if (!offerKeyExists(key, existing.requestedHotelOffers, existing.alternativeOffers)) {
        return Response.json({ error: "Invalid offer selection." }, { status: 400 });
      }

      // Backfill the USDC invoice fields for whichever room the member just
      // picked. Old offers were stamped at send_offer time using only the
      // request-level purplePriceUsd, which is now optional in the per-room
      // pricing UI — so a freshly-sent offer can land here with
      // expectedUsdcLamports = null. We recompute from the picked room's
      // own purplePrice so the on-chain matcher always has an exact target.
      const updateData: Prisma.TravelRequestUpdateInput = {
        selectedOfferKey: key,
      };
      const purpleNum = resolveSelectedPurplePriceUsd(
        key,
        existing.requestedHotelOffers,
        existing.alternativeOffers,
        existing.purplePriceUsd?.toString() ?? null,
      );
      if (purpleNum !== null) {
        try {
          const lamports = computeExpectedLamports(purpleNum, existing.requestCode);
          if (
            !existing.expectedUsdcLamports ||
            BigInt(existing.expectedUsdcLamports.toString()) !== lamports
          ) {
            updateData.expectedUsdcLamports = lamports;
          }
        } catch (error) {
          console.warn(
            "[requests:select_offer] could not compute expectedUsdcLamports:",
            error,
          );
        }
      }
      if (!existing.paymentReferencePubkey) {
        updateData.paymentReferencePubkey = generateReferencePubkey();
      }
      if (!existing.usdcPaymentAddress) {
        const treasury = process.env.PURPLE_STAY_WALLET?.trim();
        if (treasury) updateData.usdcPaymentAddress = treasury;
      }

      const updated = await prisma.travelRequest.update({
        where: { id: existing.id },
        data: updateData,
        select: { requestCode: true, selectedOfferKey: true, status: true, updatedAt: true },
      });
      return Response.json(toJsonSafe(maskVoucher(updated)));
    }

    if (action === "submit_payment") {
      const method = body.paymentMethod;
      if (!method || !Object.values(PaymentMethod).includes(method)) {
        return Response.json({ error: "A valid payment method is required." }, { status: 400 });
      }

      if (method === PaymentMethod.CASH) {
        return Response.json(
          { error: "Cash payment is not supported. Please use card or USDC." },
          { status: 400 },
        );
      }

      // Card / Stripe is reversibly disabled via env flag. We keep the
      // STRIPE enum, schema columns, and downstream code paths intact so
      // we can flip back on without a migration. Belt-and-braces: the
      // member dashboard already hides the option, but we reject here in
      // case a stale draft, an old client, or a forged request still
      // submits STRIPE.
      if (method === PaymentMethod.STRIPE && !cardPaymentsEnabled()) {
        return Response.json(
          {
            error:
              "Card payments are temporarily unavailable. Please pay with USDC on Solana.",
          },
          { status: 400 },
        );
      }

      const reference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
      const note = typeof body.paymentNote === "string" ? body.paymentNote.trim() : "";

      // USDC no longer requires a manual tx signature — the webhook (and a one-shot
      // verify call below) match the on-chain transfer to this invoice automatically.
      // STRIPE has no on-chain equivalent so we require a receipt URL / charge ID
      // up front. This becomes the authoritative reference the agent verifies
      // against in Stripe before flipping the booking to PAYMENT_VERIFIED.
      if (method === PaymentMethod.STRIPE && !reference) {
        return Response.json(
          {
            error:
              "Paste your Stripe receipt URL or charge ID so we can verify your payment.",
          },
          { status: 400 },
        );
      }

      if (existing.status === TravelRequestStatus.OFFER_EXPIRED) {
        return Response.json(
          {
            error:
              "This offer expired. Tap Re-negotiate rate to ask the concierge for a fresh round.",
            code: "OFFER_EXPIRED",
          },
          { status: 409 },
        );
      }

      if (
        existing.status !== TravelRequestStatus.OFFER_READY &&
        existing.status !== TravelRequestStatus.PAYMENT_SUBMITTED
      ) {
        return Response.json(
          { error: "Payment can only be submitted once an offer is ready." },
          { status: 400 },
        );
      }

      const desiredKey =
        typeof body.selectedOfferKey === "string" && body.selectedOfferKey.trim()
          ? body.selectedOfferKey.trim()
          : existing.selectedOfferKey ?? "";

      if (!desiredKey) {
        return Response.json(
          { error: "Select an offer before booking." },
          { status: 400 },
        );
      }

      if (!offerKeyExists(desiredKey, existing.requestedHotelOffers, existing.alternativeOffers)) {
        return Response.json({ error: "Invalid offer selection." }, { status: 400 });
      }

      const guestCheck = validateGuests(body.bookingGuests, {
        adults: existing.occupancy,
        children: existing.childrenCount,
        infants: existing.infantsCount,
      });
      if (!guestCheck.ok) {
        return Response.json({ error: guestCheck.message }, { status: 400 });
      }

      const updated = await prisma.travelRequest.update({
        where: { id: existing.id },
        data: {
          status: TravelRequestStatus.PAYMENT_SUBMITTED,
          paymentMethod: method,
          paymentReference: reference || null,
          paymentNote: note || null,
          paymentSubmittedAt: new Date(),
          paymentRejectReason: null,
          selectedOfferKey: desiredKey,
          bookingGuests: guestCheck.data,
        },
        select: {
          requestCode: true,
          status: true,
          paymentMethod: true,
          paymentReference: true,
          paymentNote: true,
          paymentSubmittedAt: true,
          selectedOfferKey: true,
          bookingGuests: true,
          updatedAt: true,
          requestedHotelName: true,
        },
      });

      void dispatchNotification({
        event: "payment_submitted",
        context: {
          requestCode: updated.requestCode,
          hotelName: updated.requestedHotelName,
          paymentMethod: updated.paymentMethod,
          paymentReference: updated.paymentReference,
          paymentNote: updated.paymentNote,
        },
      });

      // Best-effort: try to match the on-chain transfer right away. If the
      // member just sent USDC, this can flip them to PAYMENT_VERIFIED before
      // the dashboard even repolls. Errors are swallowed; the webhook + manual
      // verify button remain as the authoritative paths.
      if (
        method === PaymentMethod.USDC &&
        (existing.expectedUsdcLamports || existing.paymentReferencePubkey)
      ) {
        void verifyPaymentFromChain({
          expectedAmountLamports: existing.expectedUsdcLamports
            ? BigInt(existing.expectedUsdcLamports.toString())
            : null,
          expectedReferencePubkey: existing.paymentReferencePubkey ?? null,
          signaturesLimit: 30,
        })
          .then((result) => {
            if (result.ok && result.kind === "verified") {
              void dispatchNotification({
                event: "payment_verified",
                member: { email: existing.user?.email ?? null },
                context: {
                  requestCode: updated.requestCode,
                  hotelName: updated.requestedHotelName,
                  paymentMethod: "USDC",
                  paymentTxSignature: result.signature,
                  paymentVerifiedAmountLamports: result.amountLamports,
                },
              });
            }
          })
          .catch((error) => {
            console.error("[submit_payment] one-shot verify failed:", error);
          });
      }

      return Response.json(toJsonSafe(maskVoucher(updated)));
    }

    if (action === "request_change_cancel") {
      if (existing.status === TravelRequestStatus.PAYMENT_SUBMITTED) {
        return Response.json(
          {
            error:
              "Change requests are locked while the concierge verifies your payment. Try again once your payment is verified.",
          },
          { status: 409 },
        );
      }
      if (
        existing.status === TravelRequestStatus.CANCELLED
      ) {
        return Response.json(
          { error: "This request has been cancelled and can no longer be edited." },
          { status: 400 },
        );
      }

      if (
        existing.changeRequestStatus === ChangeRequestStatus.OPEN ||
        existing.changeRequestStatus === ChangeRequestStatus.IN_PROGRESS
      ) {
        return Response.json(
          { error: "You already have an open change request. The concierge will respond shortly." },
          { status: 400 },
        );
      }

      const type = typeof body.changeRequestType === "string" ? body.changeRequestType.trim().toUpperCase() : "";
      const note = typeof body.changeRequestNote === "string" ? body.changeRequestNote.trim() : "";

      if (!ALLOWED_CHANGE_TYPES.has(type)) {
        return Response.json({ error: "Choose a valid request type." }, { status: 400 });
      }
      if (!note) {
        return Response.json({ error: "Add a short note for the concierge." }, { status: 400 });
      }

      const updated = await prisma.travelRequest.update({
        where: { id: existing.id },
        data: {
          changeRequestStatus: ChangeRequestStatus.OPEN,
          changeRequestType: type,
          changeRequestNote: note,
          changeRequestOpenedAt: new Date(),
          changeRequestResolvedAt: null,
          agentChangeReply: null,
        },
        select: {
          requestCode: true,
          status: true,
          changeRequestStatus: true,
          changeRequestType: true,
          changeRequestNote: true,
          changeRequestOpenedAt: true,
          changeRequestResolvedAt: true,
          agentChangeReply: true,
        },
      });

      void dispatchNotification({
        event: "change_request_opened",
        context: {
          requestCode: updated.requestCode,
          hotelName: existing.requestedHotelName,
          changeRequestType: updated.changeRequestType,
          changeRequestNote: updated.changeRequestNote,
        },
      });

      return Response.json(toJsonSafe(maskVoucher(updated)));
    }

    if (action === "request_renegotiation") {
      if (existing.status !== TravelRequestStatus.OFFER_EXPIRED) {
        return Response.json(
          { error: "Re-negotiation is only available once an offer has expired." },
          { status: 400 },
        );
      }

      const snapshot = buildHistorySnapshot(existing);
      const nextHistory = appendHistory(existing.offerHistory, snapshot);

      const updated = await prisma.travelRequest.update({
        where: { id: existing.id },
        data: {
          status: TravelRequestStatus.PENDING,
          offerMode: "REQUESTED_HOTEL",
          publicPriceUsd: null,
          purplePriceUsd: null,
          requestedHotelOffers: Prisma.JsonNull,
          alternativeOffers: Prisma.JsonNull,
          stripePaymentLink: null,
          selectedOfferKey: null,
          offerSentAt: null,
          offerExpiresAt: null,
          offerHistory: nextHistory,
        },
        select: MEMBER_SELECT,
      });

      void dispatchNotification({
        event: "renegotiation_requested",
        member: { email: existing.user?.email ?? null },
        context: {
          requestCode: existing.requestCode,
          hotelName: existing.requestedHotelName,
          roundNumber: snapshot.round + 1,
        },
      });

      return Response.json(toJsonSafe(maskVoucher(updated)));
    }

    if (action === "cancel_request") {
      const reason = typeof body.cancelReason === "string" ? body.cancelReason.trim() : "";

      if (existing.status === TravelRequestStatus.CANCELLED) {
        return Response.json({ error: "This request is already cancelled." }, { status: 400 });
      }
      if (existing.status === TravelRequestStatus.PAYMENT_SUBMITTED) {
        return Response.json(
          {
            error:
              "Cancel is locked while the concierge verifies your payment. We will release the cancel option as soon as verification finishes (typically under 24h).",
          },
          { status: 409 },
        );
      }

      const isPostPayment =
        existing.status === TravelRequestStatus.PAYMENT_VERIFIED ||
        existing.status === TravelRequestStatus.CONFIRMED;

      if (isPostPayment) {
        const refund = computeRefund(
          existing.selectedOfferKey,
          existing.requestedHotelOffers,
          existing.alternativeOffers,
          existing.purplePriceUsd ?? null,
        );

        const [updated] = await prisma.$transaction([
          prisma.travelRequest.update({
            where: { id: existing.id },
            data: {
              status: TravelRequestStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelReason: reason || null,
              cancelActor: CancellationActor.MEMBER,
            },
            select: MEMBER_SELECT,
          }),
          prisma.cancellation.upsert({
            where: { travelRequestId: existing.id },
            update: {
              kind: CancellationKind.REFUND_REQUESTED,
              status: CancellationStatus.OPEN,
              actor: CancellationActor.MEMBER,
              reason: reason || null,
              refundAmountUsd: refund.amountUsd,
              refundFeePercent: refund.feePercent,
              policySnapshot: {
                policySummary: refund.policySummary,
                basePriceUsd: refund.basePriceUsd,
                selectedOfferKey: existing.selectedOfferKey,
              } as unknown as Prisma.InputJsonValue,
              requestedAt: new Date(),
              processedAt: null,
            },
            create: {
              travelRequestId: existing.id,
              kind: CancellationKind.REFUND_REQUESTED,
              status: CancellationStatus.OPEN,
              actor: CancellationActor.MEMBER,
              reason: reason || null,
              refundAmountUsd: refund.amountUsd,
              refundFeePercent: refund.feePercent,
              policySnapshot: {
                policySummary: refund.policySummary,
                basePriceUsd: refund.basePriceUsd,
                selectedOfferKey: existing.selectedOfferKey,
              } as unknown as Prisma.InputJsonValue,
            },
          }),
        ]);

        // Await the email dispatch so we can surface a delivery warning to
        // the member if their inbox provider rejected (rare, usually
        // typo'd email). The dashboard already understands the `_warning`
        // shape from the admin route.
        const refundDispatch = await dispatchNotification({
          event: "cancellation_refund_requested",
          member: { email: existing.user?.email ?? null },
          context: {
            requestCode: existing.requestCode,
            hotelName: existing.requestedHotelName,
            cancelReason: reason || null,
            // The member pressed Cancel themselves on the dashboard,
            // so the email correctly opens with "We received your
            // cancellation".
            cancelActor: "MEMBER",
            refundAmountUsd: refund.amountUsd,
            refundFeePercent: refund.feePercent,
            refundPolicySummary: refund.policySummary,
          },
        });

        return Response.json(
          withWarning(
            toJsonSafe(maskVoucher(updated)) as Record<string, unknown>,
            memberEmailWarning(refundDispatch),
          ),
        );
      }

      // Pre-payment: PENDING / OFFER_READY / OFFER_EXPIRED → instant cancel.
      const [updated] = await prisma.$transaction([
        prisma.travelRequest.update({
          where: { id: existing.id },
          data: {
            status: TravelRequestStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: reason || null,
            cancelActor: CancellationActor.MEMBER,
          },
          select: MEMBER_SELECT,
        }),
        prisma.cancellation.upsert({
          where: { travelRequestId: existing.id },
          update: {
            kind: CancellationKind.PRE_PAYMENT,
            status: CancellationStatus.PROCESSED,
            actor: CancellationActor.MEMBER,
            reason: reason || null,
            refundAmountUsd: null,
            refundFeePercent: null,
            policySnapshot: Prisma.JsonNull,
            requestedAt: new Date(),
            processedAt: new Date(),
          },
          create: {
            travelRequestId: existing.id,
            kind: CancellationKind.PRE_PAYMENT,
            status: CancellationStatus.PROCESSED,
            actor: CancellationActor.MEMBER,
            reason: reason || null,
            processedAt: new Date(),
          },
        }),
      ]);

      const cancelDispatch = await dispatchNotification({
        event: "cancel_pre_payment",
        member: { email: existing.user?.email ?? null },
        context: {
          requestCode: existing.requestCode,
          hotelName: existing.requestedHotelName,
          cancelReason: reason || null,
          cancelActor: "MEMBER",
        },
      });

      return Response.json(
        withWarning(
          toJsonSafe(maskVoucher(updated)) as Record<string, unknown>,
          memberEmailWarning(cancelDispatch),
        ),
      );
    }

    if (action === "archive") {
      if (existing.status !== TravelRequestStatus.CANCELLED) {
        return Response.json(
          { error: "Only cancelled requests can be archived." },
          { status: 400 },
        );
      }
      if (existing.archivedAt) {
        return Response.json({ error: "Already archived." }, { status: 400 });
      }
      const updated = await prisma.travelRequest.update({
        where: { id: existing.id },
        data: { archivedAt: new Date() },
        select: { id: true, requestCode: true, archivedAt: true },
      });
      return Response.json(toJsonSafe(maskVoucher(updated)));
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to process member action:", error);
    return Response.json(
      { error: "Unable to process request action." },
      { status: 500 },
    );
  }
}
