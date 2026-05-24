import { createHash } from "node:crypto";

import { db } from "@/lib/db";

/**
 * Listing analytics primitives.
 *
 * We hash viewers with `sha256(ip + ua + dayBucket + salt)` so the
 * "unique viewers" metric works without ever storing PII. Bucketing
 * by UTC day means the same IP+UA becomes a new fingerprint at
 * midnight UTC — bounded per-viewer linkability, no need for a
 * member opt-out toggle.
 *
 * `ANALYTICS_HASH_SALT` is the only ops requirement. If it's not
 * configured we fall back to a per-process random salt so dev still
 * works — but every server restart in dev re-baselines uniques. In
 * prod (on Vercel) the env var should be set once and never rotated.
 */

export type ListingEventType =
  | "IMPRESSION"
  | "DRAWER_OPEN"
  | "CODE_COPY"
  | "WEBSITE_CLICK"
  | "MAPS_CLICK"
  | "PASS_SCAN";

export const WEB_EVENT_TYPES = [
  "IMPRESSION",
  "DRAWER_OPEN",
  "CODE_COPY",
  "WEBSITE_CLICK",
  "MAPS_CLICK",
] as const satisfies readonly ListingEventType[];

const DEV_SALT_FALLBACK = createHash("sha256")
  .update(`${Date.now()}-${Math.random()}`)
  .digest("hex");

function getSalt(): string {
  return process.env.ANALYTICS_HASH_SALT?.trim() || DEV_SALT_FALLBACK;
}

function dayBucket(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

export function hashViewer(ip: string, ua: string): string {
  return createHash("sha256")
    .update(`${ip}|${ua}|${dayBucket()}|${getSalt()}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Best-effort viewer IP. Vercel sets `x-forwarded-for` to a
 * comma-separated chain; the first entry is the client. Falls back
 * to the empty string if we can't read it — better than throwing.
 */
function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "";
}

function classifyUa(ua: string): "mobile" | "desktop" | "bot" {
  if (!ua) return "desktop";
  if (/bot|crawler|spider|crawling/i.test(ua)) return "bot";
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) return "mobile";
  return "desktop";
}

export type GeoInfo = {
  country: string | null;
  city: string | null;
};

export function getGeoFromHeaders(headers: Headers): GeoInfo {
  return {
    country: headers.get("x-vercel-ip-country")?.trim() || null,
    city: decodeVercelCity(headers.get("x-vercel-ip-city")),
  };
}

function decodeVercelCity(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export type RecordEventInput = {
  listingId: string;
  eventType: ListingEventType;
  headers: Headers;
  /**
   * Optional referrer override. Browser-side trackers post their
   * own `document.referrer` because the network-level referer header
   * is typically same-origin (defeats the purpose).
   */
  referrer?: string | null;
};

export async function recordEvent(input: RecordEventInput): Promise<void> {
  const { listingId, eventType, headers, referrer } = input;
  const ip = getClientIp(headers);
  const ua = headers.get("user-agent") ?? "";
  const viewerHash = hashViewer(ip, ua);
  const { country, city } = getGeoFromHeaders(headers);

  try {
    await db.listingEvent.create({
      data: {
        listingId,
        eventType,
        viewerHash,
        country,
        city,
        uaKind: classifyUa(ua),
        referrer: (referrer ?? headers.get("referer"))?.slice(0, 240) ?? null,
      },
    });
  } catch (error) {
    // Analytics writes should never break a user-facing request.
    // We swallow + log so a transient DB hiccup doesn't burn an
    // impression or a pass-scan verification.
    console.error("recordEvent failed", error);
  }
}
