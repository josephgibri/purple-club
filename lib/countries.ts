import { cities, type CityTuple } from "@/data/cities";

/**
 * Deduped country list derived from the bundled GeoNames cities data.
 * We *could* ship a separate countries file but everything we need
 * (ISO-2 code + country name) already lives in `data/cities.ts`, and
 * deriving here means the city autocomplete + country dropdown can
 * never go out of sync.
 *
 * The list is computed once on first access and cached at module scope.
 */
export type Country = {
  code: string;
  name: string;
};

let cachedCountries: Country[] | null = null;

export function getCountries(): Country[] {
  if (cachedCountries) return cachedCountries;
  const seen = new Map<string, string>();
  for (const row of cities as CityTuple[]) {
    const code = row[1];
    const name = row[2];
    if (!seen.has(code)) seen.set(code, name);
  }
  cachedCountries = Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return cachedCountries;
}

export function findCountryByName(name: string): Country | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  return getCountries().find((c) => c.name.toLowerCase() === target);
}

export function findCountryByCode(code: string): Country | undefined {
  const target = code.trim().toUpperCase();
  if (!target) return undefined;
  return getCountries().find((c) => c.code === target);
}
