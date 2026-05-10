// Server-only Foursquare Places (v3) helper.
// Free tier: ~99,500 calls/month for non-enterprise.
// Docs: https://docs.foursquare.com/developer/reference/place-search

const ENDPOINT = "https://api.foursquare.com/v3/places/search";

export type FsqPlace = {
  fsq_id: string;
  name: string;
  location?: {
    address?: string;
    locality?: string;
    region?: string;
    country?: string;
    formatted_address?: string;
  };
  geocodes?: {
    main?: { latitude: number; longitude: number };
  };
  categories?: Array<{ id: number; name: string }>;
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
    id: p.fsq_id,
    name: p.name,
    address: loc.formatted_address ?? loc.address ?? "",
    city: loc.locality ?? "",
    country: loc.country ?? "",
    lat: p.geocodes?.main?.latitude ?? null,
    lng: p.geocodes?.main?.longitude ?? null,
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
      Authorization: apiKey,
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
