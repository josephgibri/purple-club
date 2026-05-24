import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ListingEventType } from "@/lib/analytics";

/**
 * Per-merchant analytics rollup.
 *
 * Returns one block per APPROVED listing owned by the signed-in
 * merchant. We compute everything in-memory from the last 30 days
 * of raw events — fine until ~100K events per merchant, at which
 * point we'd swap in a nightly materialized rollup.
 *
 * Shape per listing:
 *  - listingId, merchantId, businessName
 *  - summary7d / summary30d: counts per event + uniqueViewers
 *  - funnel: stage-to-stage conversion percentages (7d window)
 *  - daily30d: per-day { date, impressions, actions } for the chart
 *  - topCountries: top 5 by impressions (30d)
 *  - topHours: 24-bucket histogram of PASS_SCAN by hour-of-day (30d)
 */

export const dynamic = "force-dynamic";

type DailyBucket = { date: string; impressions: number; actions: number };

type ListingAnalytics = {
  listingId: string;
  merchantId: string;
  businessName: string;
  summary7d: SummaryCounts;
  summary30d: SummaryCounts;
  funnel: Funnel;
  daily30d: DailyBucket[];
  topCountries: Array<{ country: string; impressions: number }>;
  topHours: number[];
};

type SummaryCounts = {
  impressions: number;
  uniqueViewers: number;
  drawerOpens: number;
  codeCopies: number;
  websiteClicks: number;
  mapsClicks: number;
  passScans: number;
};

type Funnel = {
  impressionsToDrawer: number;
  drawerToAction: number;
  // Combined: any post-drawer action (copy / website / maps / scan).
  overallConversion: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.merchantProfile.findUnique({
    where: { userId: session.uid },
    select: { id: true },
  });
  if (!profile) {
    return Response.json({ listings: [] });
  }

  const listings = await db.merchantListing.findMany({
    where: {
      merchantProfileId: profile.id,
      status: "APPROVED",
    },
    select: { id: true, merchantId: true, businessName: true },
  });

  if (listings.length === 0) {
    return Response.json({ listings: [] });
  }

  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const since7 = new Date(Date.now() - 7 * DAY_MS);

  const events = await db.listingEvent.findMany({
    where: {
      listingId: { in: listings.map((l) => l.id) },
      createdAt: { gte: since30 },
    },
    select: {
      listingId: true,
      eventType: true,
      viewerHash: true,
      country: true,
      createdAt: true,
    },
  });

  const byListing = new Map<string, typeof events>();
  for (const event of events) {
    const bucket = byListing.get(event.listingId);
    if (bucket) bucket.push(event);
    else byListing.set(event.listingId, [event]);
  }

  const analytics: ListingAnalytics[] = listings.map((listing) => {
    const all = byListing.get(listing.id) ?? [];
    const recent7 = all.filter((e) => e.createdAt >= since7);

    return {
      listingId: listing.id,
      merchantId: listing.merchantId,
      businessName: listing.businessName,
      summary7d: summarize(recent7),
      summary30d: summarize(all),
      funnel: computeFunnel(recent7),
      daily30d: dailyBuckets(all),
      topCountries: topCountries(all),
      topHours: hourHistogram(all),
    };
  });

  return Response.json({
    listings: analytics,
    generatedAt: new Date().toISOString(),
  });
}

type EventRow = {
  eventType: ListingEventType;
  viewerHash: string;
  country: string | null;
  createdAt: Date;
};

function summarize(events: EventRow[]): SummaryCounts {
  const counts: SummaryCounts = {
    impressions: 0,
    uniqueViewers: 0,
    drawerOpens: 0,
    codeCopies: 0,
    websiteClicks: 0,
    mapsClicks: 0,
    passScans: 0,
  };
  const viewers = new Set<string>();
  for (const event of events) {
    viewers.add(event.viewerHash);
    switch (event.eventType) {
      case "IMPRESSION":
        counts.impressions += 1;
        break;
      case "DRAWER_OPEN":
        counts.drawerOpens += 1;
        break;
      case "CODE_COPY":
        counts.codeCopies += 1;
        break;
      case "WEBSITE_CLICK":
        counts.websiteClicks += 1;
        break;
      case "MAPS_CLICK":
        counts.mapsClicks += 1;
        break;
      case "PASS_SCAN":
        counts.passScans += 1;
        break;
    }
  }
  counts.uniqueViewers = viewers.size;
  return counts;
}

function computeFunnel(events: EventRow[]): Funnel {
  const s = summarize(events);
  const actions = s.codeCopies + s.websiteClicks + s.mapsClicks + s.passScans;
  return {
    impressionsToDrawer: pct(s.drawerOpens, s.impressions),
    drawerToAction: pct(actions, s.drawerOpens),
    overallConversion: pct(actions, s.impressions),
  };
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function dailyBuckets(events: EventRow[]): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = isoDay(d);
    buckets.set(key, { date: key, impressions: 0, actions: 0 });
  }
  for (const event of events) {
    const key = isoDay(event.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (event.eventType === "IMPRESSION") {
      bucket.impressions += 1;
    } else if (
      event.eventType === "CODE_COPY" ||
      event.eventType === "WEBSITE_CLICK" ||
      event.eventType === "MAPS_CLICK" ||
      event.eventType === "PASS_SCAN"
    ) {
      bucket.actions += 1;
    }
  }
  return Array.from(buckets.values());
}

function isoDay(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function topCountries(events: EventRow[]): Array<{ country: string; impressions: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType !== "IMPRESSION") continue;
    const key = event.country?.toUpperCase() || "??";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([country, impressions]) => ({ country, impressions }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
}

function hourHistogram(events: EventRow[]): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const event of events) {
    if (event.eventType !== "PASS_SCAN") continue;
    const hour = event.createdAt.getUTCHours();
    buckets[hour] += 1;
  }
  return buckets;
}
