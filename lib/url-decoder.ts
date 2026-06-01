export type DecodedHotelDetails = {
  hotelName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  occupancy?: number;
  adults?: number;
  children?: number;
  infants?: number;
  childrenAges?: number[];
  infantAges?: number[];
  source?: string;
  /**
   * True when the host matches one of the OTAs / hotel brands we
   * actively recognize (Booking, Expedia, Agoda, Hotels.com, and a
   * handful of direct hotel chains). Drives the green "Verified"
   * badge vs. the amber "unrecognized site" warning on the request
   * form. Note: a known source does NOT guarantee we extracted a
   * hotel name — for direct chains we often only set `source`.
   */
  isKnownSource?: boolean;
};

/**
 * Does the host's eTLD+1 (or eTLD+2) exactly match one of these
 * roots? Used for single-domain brands like Booking.com or
 * Hotels.com whose name is too generic to label-match safely
 * (`hotels` alone would catch `myhotels.example`).
 *
 * Matches `foo.com` and `*.foo.com`, but NOT `evilfoo.com`.
 */
function hostEndsWithRoot(host: string, ...roots: string[]): boolean {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

/**
 * Does any DNS label in the host equal `brand`? Catches localized
 * country TLDs (e.g. `expedia.fr`, `expedia.co.uk`) without having
 * to enumerate every country. Only safe for brand names that are
 * unique words on their own (Expedia, Agoda, Marriott, Hilton…) —
 * don't use for generic words like `hotels` or `travel`.
 *
 * Returns true for `www.expedia.com`, `expedia.co.uk`,
 * `secure.expedia.de`. Returns false for `myexpedia.com` or
 * `evilexpedia.com.attacker.io` because `expedia` isn't a label
 * boundary there.
 */
function hostHasBrand(host: string, brand: string): boolean {
  return host.split(".").includes(brand);
}

// Hotels.com country TLDs we currently match. `hotels` alone is too
// generic to label-match safely, so we enumerate. Add new TLDs here
// as members complain about unrecognized links.
const HOTELS_COM_ROOTS = [
  "hotels.com",
  "hotels.de",
  "hotels.fr",
  "hotels.it",
  "hotels.es",
  "hotels.nl",
  "hotels.at",
  "hotels.ch",
  "hotels.dk",
  "hotels.no",
  "hotels.se",
  "hotels.co.uk",
  "hotels.co.jp",
  "hotels.com.au",
  "hotels.com.br",
  "hotels.com.mx",
];

function slugToTitle(value: string) {
  const cleaned = value
    .replace(/[-_]+/g, " ")
    .replace(/%20/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split simple camelCase/PascalCase tokens into readable words.
  const splitCamelCase = cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");

  return splitCamelCase.replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function normalizeDate(value: string | null) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return undefined;
}

function toPositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function parseAgeParams(params: URLSearchParams) {
  const raw = [...params.getAll("age"), ...params.getAll("ages")]
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return raw;
}

function parseHotelNameFromQuery(parsed: URL) {
  const candidateKeys = [
    "hotel",
    "hotelName",
    "hotel_name",
    "property",
    "propertyName",
    "property_name",
    "name",
    "destination",
    "dest",
    "ss",
  ];

  for (const key of candidateKeys) {
    const value = parsed.searchParams.get(key);
    if (!value) continue;
    const title = slugToTitle(value);
    if (
      title &&
      title.toLowerCase() !== "searchresults" &&
      title.toLowerCase() !== "search results"
    ) {
      return title;
    }
  }

  return undefined;
}

export function decodeHotelUrl(rawUrl: string): DecodedHotelDetails {
  try {
    const parsed = new URL(rawUrl);
    const details: DecodedHotelDetails = {};
    const host = parsed.hostname.toLowerCase();

    if (hostEndsWithRoot(host, "booking.com")) {
      details.source = "Booking.com";
      details.isKnownSource = true;
      const match = parsed.pathname.match(/\/hotel\/[^/]+\/([^/.]+)/);
      if (match?.[1]) details.hotelName = slugToTitle(match[1]);
      details.checkInDate = normalizeDate(parsed.searchParams.get("checkin"));
      details.checkOutDate = normalizeDate(parsed.searchParams.get("checkout"));
      const adults = toPositiveInt(parsed.searchParams.get("group_adults"));
      const children = toPositiveInt(parsed.searchParams.get("group_children")) ?? 0;
      const ageList = parseAgeParams(parsed.searchParams);
      const infantAges = ageList.filter((age) => age < 2);
      const childrenAges = ageList.filter((age) => age >= 2);
      const infants = toPositiveInt(parsed.searchParams.get("no_infants")) ?? infantAges.length;
      let effectiveChildren = children;
      if (effectiveChildren === 0 && childrenAges.length > 0) {
        effectiveChildren = childrenAges.length;
      }
      if (adults !== undefined) details.adults = adults;
      details.children = effectiveChildren;
      details.infants = infants;
      if (childrenAges.length > 0) details.childrenAges = childrenAges;
      if (infantAges.length > 0) details.infantAges = infantAges;
      if (adults !== undefined) details.occupancy = adults;
    } else if (hostHasBrand(host, "expedia")) {
      details.source = "Expedia";
      details.isKnownSource = true;
      const match = parsed.pathname.match(/\/Hotel-Information(?:\?|$)/);
      if (!match) {
        const slug = parsed.pathname.split("/").filter(Boolean).pop();
        if (slug) details.hotelName = slugToTitle(slug.replace(/\./g, " "));
      }
      details.checkInDate = normalizeDate(parsed.searchParams.get("startDate"));
      details.checkOutDate = normalizeDate(parsed.searchParams.get("endDate"));
      const adults = toPositiveInt(parsed.searchParams.get("adults"));
      const children = toPositiveInt(parsed.searchParams.get("children")) ?? 0;
      const infants = toPositiveInt(parsed.searchParams.get("infants")) ?? 0;
      if (adults !== undefined) details.adults = adults;
      details.children = children;
      details.infants = infants;
      if (adults !== undefined) details.occupancy = adults;
    } else if (hostHasBrand(host, "agoda")) {
      details.source = "Agoda";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug.replace(/\.html?$/i, ""));
      details.checkInDate = normalizeDate(parsed.searchParams.get("checkIn"));
      details.checkOutDate = normalizeDate(parsed.searchParams.get("checkOut"));
      const adults = toPositiveInt(parsed.searchParams.get("adults"));
      const children = toPositiveInt(parsed.searchParams.get("children")) ?? 0;
      const infants = toPositiveInt(parsed.searchParams.get("infants")) ?? 0;
      if (adults !== undefined) details.adults = adults;
      details.children = children;
      details.infants = infants;
      if (adults !== undefined) details.occupancy = adults;
    } else if (hostEndsWithRoot(host, ...HOTELS_COM_ROOTS)) {
      // Hotels.com / Expedia Group sister brand. Path looks like
      // /ho123456/Some-Hotel-Name/ and dates ride in q-check-in /
      // q-check-out. Guests use q-rooms with structured tokens, so
      // we only opportunistically parse adults/children.
      details.source = "Hotels.com";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) {
        details.hotelName = slugToTitle(
          slug.replace(/\.html?$/i, "").replace(/^ho\d+$/i, ""),
        );
      }
      details.checkInDate = normalizeDate(
        parsed.searchParams.get("q-check-in") ??
          parsed.searchParams.get("chkin") ??
          parsed.searchParams.get("startDate"),
      );
      details.checkOutDate = normalizeDate(
        parsed.searchParams.get("q-check-out") ??
          parsed.searchParams.get("chkout") ??
          parsed.searchParams.get("endDate"),
      );
      const adults =
        toPositiveInt(parsed.searchParams.get("q-room-0-adults")) ??
        toPositiveInt(parsed.searchParams.get("adults"));
      const children =
        toPositiveInt(parsed.searchParams.get("q-room-0-children")) ??
        toPositiveInt(parsed.searchParams.get("children")) ??
        0;
      if (adults !== undefined) details.adults = adults;
      details.children = children;
      if (adults !== undefined) details.occupancy = adults;
    } else if (hostHasBrand(host, "marriott")) {
      // Marriott direct (incl. Ritz-Carlton, St Regis, W, EDITION
      // — all on marriott.com paths). URL params vary by sub-brand
      // so we only reliably extract the property name from the slug.
      details.source = "Marriott";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) {
        details.hotelName = slugToTitle(
          slug.replace(/\.mi$/i, "").replace(/-overview$/i, ""),
        );
      }
    } else if (hostHasBrand(host, "hilton")) {
      // Hilton direct (incl. Waldorf, Conrad, Curio).
      details.source = "Hilton";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug.replace(/\.html?$/i, ""));
    } else if (hostHasBrand(host, "fourseasons")) {
      details.source = "Four Seasons";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug);
    } else if (hostHasBrand(host, "ihg")) {
      // IHG = InterContinental, Kimpton, Holiday Inn, Crowne Plaza.
      details.source = "IHG";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug);
    } else if (hostHasBrand(host, "accor") || hostHasBrand(host, "sofitel")) {
      // Accor = Sofitel, Novotel, Pullman, Mövenpick, Raffles…
      // accor.com and all.accor.com both route here, plus the
      // brand-specific direct sites (sofitel.com).
      details.source = "Accor";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug.replace(/\.html?$/i, ""));
    } else if (hostHasBrand(host, "trivago")) {
      // Trivago is a metasearch — date/guest params are unreliable
      // once the user is forwarded to a partner. Set source + name
      // only so the agent knows to re-fetch fresh inventory.
      details.source = "Trivago";
      details.isKnownSource = true;
      const slug = parsed.pathname.split("/").filter(Boolean).pop();
      if (slug) details.hotelName = slugToTitle(slug.replace(/\.html?$/i, ""));
    } else {
      details.source = parsed.hostname;
      details.isKnownSource = false;
    }

    if (!details.hotelName) {
      const fallbackFromQuery = parseHotelNameFromQuery(parsed);
      if (fallbackFromQuery) {
        details.hotelName = fallbackFromQuery;
      }
    }

    if (!details.hotelName) {
      const fallbackSlug = parsed.pathname.split("/").filter(Boolean).pop();
      if (fallbackSlug) {
        const candidate = slugToTitle(
          fallbackSlug
            .replace(/\.html?$/i, "")
            .replace(/[.,]+/g, " ")
            .trim(),
        );
        if (
          candidate &&
          candidate.toLowerCase() !== "searchresults" &&
          candidate.toLowerCase() !== "search results"
        ) {
          details.hotelName = candidate;
        }
      }
    }

    return details;
  } catch {
    return {};
  }
}
