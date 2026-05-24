import { db } from "@/lib/db";
import {
  WEB_EVENT_TYPES,
  hashViewer,
  recordEvent,
  type ListingEventType,
} from "@/lib/analytics";

/**
 * Public funnel-tracking endpoint hit by the directory + drawer for
 * IMPRESSION / DRAWER_OPEN / CODE_COPY / WEBSITE_CLICK / MAPS_CLICK.
 *
 * Hard-rejects PASS_SCAN: that one is server-issued by
 * /api/public/verify-pass when a real pass is verified, so it can't
 * be padded from a browser console.
 *
 * Returns 204 No Content with `Cache-Control: no-store` so beacons
 * stay cheap and CDNs never cache success states.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WEB_EVENT_SET = new Set<ListingEventType>(WEB_EVENT_TYPES);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_WINDOW = 80;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(viewerHash: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(viewerHash);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(viewerHash, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_WINDOW) return false;
  return true;
}

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  let payload: { merchantId?: string; eventType?: string; referrer?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return noContent();
  }

  const merchantId = payload.merchantId?.trim();
  const eventType = payload.eventType as ListingEventType | undefined;
  if (!merchantId || !eventType || !WEB_EVENT_SET.has(eventType)) {
    return noContent();
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "";
  const ua = request.headers.get("user-agent") ?? "";
  if (!rateLimit(hashViewer(ip, ua))) return noContent();

  // Resolve the public slug to the DB row. Bundled-JSON merchants
  // (legacy demo data) won't have a row and silently no-op — fine,
  // they're not real merchants asking for analytics.
  const listing = await db.merchantListing.findUnique({
    where: { merchantId },
    select: { id: true, status: true },
  });
  if (!listing || listing.status !== "APPROVED") return noContent();

  await recordEvent({
    listingId: listing.id,
    eventType,
    headers: request.headers,
    referrer: payload.referrer ?? null,
  });
  return noContent();
}
