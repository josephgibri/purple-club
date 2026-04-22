import merchantsData from "./merchants.json";

export const MERCHANT_CATEGORIES = [
  "retail_goods",
  "dining_nightlife",
  "tech_digital",
  "travel_leisure",
  "wellness_beauty",
  "professional_services",
] as const;

export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export const SOCIAL_PLATFORMS = ["instagram", "x", "tiktok"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type Merchant = {
  id: string;
  name: string;
  category: MerchantCategory;
  isOnline: boolean;
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
