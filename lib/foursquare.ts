// Server-only Foursquare Places helper.
// Free tier: ~99,500 calls/month for non-enterprise.
// Docs: https://docs.foursquare.com/fsq-developers-places/reference/place-search
// Migration: https://docs.foursquare.com/fsq-developers-users/reference/migration-guide
//
// Foursquare deprecated the legacy `api.foursquare.com/v3/...` host
// in 2025 and rolled out new "Service API Keys" that authenticate via
// `Authorization: Bearer <key>` and require a dated `X-Places-Api-Version`
// header. The response shape also changed: `fsq_id` → `fsq_place_id`,
// `geocodes.main.{latitude,longitude}` → top-level `latitude` / `longitude`.
// We keep the public `FsqMatch` shape identical so downstream callers
// (AddressAutocomplete, listing routes) need zero changes.

const ENDPOINT = "https://places-api.foursquare.com/places/search";
const PLACES_API_VERSION = "2025-06-17";

export type FsqPlace = {
  fsq_place_id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  location?: {
    address?: string;
    locality?: string;
    region?: string;
    country?: string;
    formatted_address?: string;
  };
  categories?: Array<{ fsq_category_id: string; name: string }>;
  website?: string;
  tel?: string;
  distance?: number;
};

export type FsqMatch = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  category: string;
  website: string;
  tel: string;
};

export type FsqSearchInput = {
  query: string;
  near?: string;
  ll?: string;
  limit?: number;
};

function getApiKey(): string {
  const key = process.env.FOURSQUARE_API_KEY;
  if (!key) throw new Error("FOURSQUARE_API_KEY is not configured");
  return key;
}

export function isFsqEnabled(): boolean {
  return Boolean(process.env.FOURSQUARE_API_KEY);
}

function toMatch(p: FsqPlace): FsqMatch {
  const loc = p.location ?? {};
  return {
    id: p.fsq_place_id,
    name: p.name,
    address: loc.formatted_address ?? loc.address ?? "",
    city: loc.locality ?? "",
    country: loc.country ?? "",
    lat: typeof p.latitude === "number" ? p.latitude : null,
    lng: typeof p.longitude === "number" ? p.longitude : null,
    category: p.categories?.[0]?.name ?? "",
    website: p.website ?? "",
    tel: p.tel ?? "",
  };
}

export async function searchPlaces(input: FsqSearchInput): Promise<FsqMatch[]> {
  const apiKey = getApiKey();
  const params = new URLSearchParams();
  params.set("query", input.query.trim());
  if (input.ll) params.set("ll", input.ll);
  else if (input.near) params.set("near", input.near);
  params.set("limit", String(Math.min(Math.max(input.limit ?? 8, 1), 20)));

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Places-Api-Version": PLACES_API_VERSION,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Foursquare error ${res.status}: ${text.slice(0, 240)}`);
  }

  const data = (await res.json()) as { results?: FsqPlace[] };
  return (data.results ?? []).map(toMatch);
}
