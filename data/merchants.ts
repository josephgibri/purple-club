import merchantsData from "./merchants.json";

/**
 * Canonical merchant taxonomy. Ordered roughly by expected real-world
 * frequency in the directory (retail / dining sit at the top because
 * that's what most physical shops are). Adding a new value:
 *
 *  1. Append it here.
 *  2. Add a human label to `CATEGORY_LABELS`.
 *  3. Add a fallback hero image path to `CATEGORY_HERO_FALLBACK` (or
 *     reuse one of the existing template SVGs — we only generate new
 *     templates when the category gets enough listings to warrant one).
 *  4. Mirror the value in `.github/ISSUE_TEMPLATE/merchant_submission.yml`
 *     so the legacy relay flow still validates.
 */
export const MERCHANT_CATEGORIES = [
  "retail_goods",
  "dining_nightlife",
  "fashion_apparel",
  "groceries_markets",
  "home_lifestyle",
  "arts_entertainment",
  "travel_leisure",
  "wellness_beauty",
  "fitness_sports",
  "kids_family",
  "education_learning",
  "tech_digital",
  "professional_services",
  "automotive",
  "pets",
  "crypto_web3",
] as const;

export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  retail_goods: "Retail & Goods",
  dining_nightlife: "Dining & Nightlife",
  fashion_apparel: "Fashion & Apparel",
  groceries_markets: "Groceries & Markets",
  home_lifestyle: "Home & Lifestyle",
  arts_entertainment: "Arts & Entertainment",
  travel_leisure: "Travel & Leisure",
  wellness_beauty: "Wellness & Beauty",
  fitness_sports: "Fitness & Sports",
  kids_family: "Kids & Family",
  education_learning: "Education & Learning",
  tech_digital: "Tech & Digital",
  professional_services: "Professional Services",
  automotive: "Automotive",
  pets: "Pets",
  crypto_web3: "Crypto & Web3",
};

/**
 * SVG used in directory cards and detail drawers when a merchant
 * hasn't uploaded their own hero image, or when the upload errors at
 * render time. New categories without a bespoke template fall back to
 * the closest existing one — purely a visual fallback, never persisted.
 */
export const CATEGORY_HERO_FALLBACK: Record<MerchantCategory, string> = {
  retail_goods: "/templates/retail-template.svg",
  dining_nightlife: "/templates/dining-template.svg",
  fashion_apparel: "/templates/retail-template.svg",
  groceries_markets: "/templates/retail-template.svg",
  home_lifestyle: "/templates/retail-template.svg",
  arts_entertainment: "/templates/travel-template.svg",
  travel_leisure: "/templates/travel-template.svg",
  wellness_beauty: "/templates/wellness-template.svg",
  fitness_sports: "/templates/wellness-template.svg",
  kids_family: "/templates/retail-template.svg",
  education_learning: "/templates/professional-template.svg",
  tech_digital: "/templates/tech-template.svg",
  professional_services: "/templates/professional-template.svg",
  automotive: "/templates/professional-template.svg",
  pets: "/templates/wellness-template.svg",
  crypto_web3: "/templates/tech-template.svg",
};

export const SOCIAL_PLATFORMS = ["instagram", "x", "tiktok"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const MERCHANT_TYPES = ["ONLINE", "LOCAL", "HYBRID"] as const;
export type MerchantType = (typeof MERCHANT_TYPES)[number];

export type Merchant = {
  id: string;
  name: string;
  category: MerchantCategory;
  /** Legacy field. Kept for back-compat — prefer `merchantType`. */
  isOnline: boolean;
  /**
   * Channel mix. New listings ship this; legacy listings get a
   * best-effort fallback derived from `isOnline` at the API layer.
   * Optional here so the bundled `data/merchants.json` (which predates
   * the field) keeps type-checking without a one-off migration.
   */
  merchantType?: MerchantType;
  country: string;
  city: string;
  fullAddress: string;
  discount: string;
  locationOrCoverage: string;
  description: string;
  logoUrl: string;
  heroImageUrl: string;
  promoCode?: string;
  isAnchor?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  verificationHint?: string;
  lat?: number;
  lng?: number;
  socialPlatform?: SocialPlatform;
  socialHandle?: string;
};

export const merchants: Merchant[] = merchantsData as Merchant[];
