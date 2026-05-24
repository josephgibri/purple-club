// Server-only geocoding helper backed by OpenStreetMap Nominatim.
// Free, no API key, planet-wide coverage, same data source as the
// Leaflet map tiles we already render — so addresses returned here
// always line up with what the merchant sees on the map.
//
// Usage policy compliance:
//  - Public endpoint is shared, so we MUST send a User-Agent that
//    identifies us + a contact email. Nominatim blocks anonymous
//    or browser-default UAs.
//  - ≤1 req/sec recommended. We enforce a small in-memory LRU
//    cache + 700ms debounce on the client to stay well under it.
//  - Heavy use should self-host. For our scale (a few merchants /
//    week typing into one form) the public endpoint is fine.
//
// Docs: https://nominatim.org/release-docs/develop/api/Overview/

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT =
  "Purple-Club-Merchant-Onboarding/1.0 (https://purpleclub.xyz; hello@purpleclub.xyz)";

export type AddressSuggestion = {
  /** Stable id from Nominatim (`osm_type:osm_id`). Used as React key. */
  id: string;
  /** Single-line human-readable address (display_name). */
  label: string;
  /** Short label for the primary line in the dropdown (street + venue). */
  primary: string;
  /** Secondary line: city, country. */
  secondary: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  countryCode: string;
};

export type SearchInput = {
  query: string;
  /** ISO 3166-1 alpha-2 country code to scope results to. */
  countryCode?: string;
  limit?: number;
};

type NominatimSearchResult = {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

type NominatimAddress = {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  amenity?: string;
  shop?: string;
  tourism?: string;
  building?: string;
};

// Tiny LRU. Geocoding is deterministic — same input always gives
// same output — so caching is free correctness-wise and saves us
// from hammering Nominatim during typing.
class LRU<K, V> {
  private readonly max: number;
  private readonly map = new Map<K, V>();
  constructor(max: number) {
    this.max = max;
  }
  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Re-insert to refresh recency.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}

const searchCache = new LRU<string, AddressSuggestion[]>(256);
const reverseCache = new LRU<string, AddressSuggestion | null>(256);

function pickCity(addr: NominatimAddress): string {
  return (
    addr.city ??
    addr.town ??
    addr.village ??
    addr.suburb ??
    addr.county ??
    addr.state ??
    ""
  );
}

function pickPrimary(addr: NominatimAddress, fallback: string): string {
  // Prefer the venue name when we have one (shop / amenity / tourism),
  // then fall back to "house_number road", then to the first segment
  // of the full display name.
  if (addr.shop || addr.amenity || addr.tourism) {
    return addr.shop ?? addr.amenity ?? addr.tourism ?? fallback;
  }
  if (addr.road) {
    return addr.house_number ? `${addr.house_number} ${addr.road}` : addr.road;
  }
  return fallback.split(",")[0]?.trim() ?? fallback;
}

function toSuggestion(result: NominatimSearchResult): AddressSuggestion {
  const addr = result.address ?? {};
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  const city = pickCity(addr);
  const country = addr.country ?? "";
  const countryCode = (addr.country_code ?? "").toUpperCase();
  const primary = pickPrimary(addr, result.display_name);
  const secondary = [city, country].filter(Boolean).join(", ");
  return {
    id: `${result.osm_type}:${result.osm_id}`,
    label: result.display_name,
    primary,
    secondary,
    lat,
    lng,
    city,
    country,
    countryCode,
  };
}

async function nominatimFetch(path: string): Promise<Response> {
  const url = `${NOMINATIM_BASE}${path}`;
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "en",
    },
    // Server-side only; no need to hit our edge cache.
    cache: "no-store",
  });
}

export async function searchAddress(input: SearchInput): Promise<AddressSuggestion[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];
  const cacheKey = `${input.countryCode ?? ""}|${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.min(Math.max(input.limit ?? 8, 1), 20)),
  });
  if (input.countryCode) {
    params.set("countrycodes", input.countryCode.toLowerCase());
  }
  const res = await nominatimFetch(`/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Nominatim search ${res.status}`);
  }
  const data = (await res.json()) as NominatimSearchResult[];
  const suggestions = data.map(toSuggestion);
  searchCache.set(cacheKey, suggestions);
  return suggestions;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<AddressSuggestion | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Round to ~10m resolution to keep the cache hit-rate high for
  // small jitter during pin drag.
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
  });
  const res = await nominatimFetch(`/reverse?${params.toString()}`);
  if (!res.ok) {
    if (res.status === 404) {
      reverseCache.set(cacheKey, null);
      return null;
    }
    throw new Error(`Nominatim reverse ${res.status}`);
  }
  const data = (await res.json()) as NominatimSearchResult | { error: string };
  if ("error" in data) {
    reverseCache.set(cacheKey, null);
    return null;
  }
  const suggestion = toSuggestion(data);
  reverseCache.set(cacheKey, suggestion);
  return suggestion;
}
