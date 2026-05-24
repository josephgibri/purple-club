import { z } from "zod";

import { toSlug, WEBSITE_REGEX } from "@/lib/merchantSchema";
import { MERCHANT_CATEGORIES, SOCIAL_PLATFORMS } from "@/data/merchants";

/**
 * Wrap any `.optional()` string schema so an empty string from the form
 * (`""`) is treated as absent. Zod's native `.optional()` only catches
 * `undefined`, which combined with a `.min(N)` rule used to produce the
 * unhelpful "String must contain at least N character(s)" error on
 * untouched optional inputs. Caller still gets the same nominal type.
 */
function optionalNonEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

/**
 * Format the first Zod issue with a leading field name so users see e.g.
 * `Custom slug: must be at least 2 characters` instead of the bare
 * `String must contain at least 2 character(s)`. Falls back to the
 * generic message when no path is available.
 */
const FIELD_LABELS: Record<string, string> = {
  merchantId: "Custom slug",
  businessName: "Business name",
  businessBrief: "Business brief",
  category: "Category",
  country: "Country",
  city: "City",
  fullAddress: "Full address",
  website: "Website",
  logoUrl: "Logo",
  heroImageUrl: "Hero image",
  promoCode: "Promo code",
  discountDetails: "Discount details",
  socialPlatform: "Social platform",
  socialHandle: "Social handle",
  email: "Email",
  password: "Password",
  displayName: "Business name",
  merchantType: "Merchant type",
};

/**
 * Sales channel mix for a listing.
 *  - ONLINE: e-commerce only, no physical address.
 *  - LOCAL:  brick-and-mortar storefront only.
 *  - HYBRID: both — has an online checkout AND a physical storefront,
 *            so members can redeem either with a promo code or a
 *            counter pass-scan.
 */
export const MERCHANT_TYPES = ["ONLINE", "LOCAL", "HYBRID"] as const;
export type MerchantTypeValue = (typeof MERCHANT_TYPES)[number];

export function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid payload";
  const path = issue.path[0];
  const fieldKey = typeof path === "string" ? path : undefined;
  const fieldLabel = fieldKey ? (FIELD_LABELS[fieldKey] ?? fieldKey) : undefined;
  return fieldLabel ? `${fieldLabel}: ${issue.message}` : issue.message;
}

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80),
});

export function deriveUsername(email: string): string {
  const local = email.split("@")[0] ?? "merchant";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24);
  return cleaned.length >= 3 ? cleaned : `${cleaned}_${Math.random().toString(36).slice(2, 6)}`;
}

export const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(8).max(128),
});

const baseListingShape = {
  merchantId: optionalNonEmpty(z.string().trim().min(2)),
  businessName: z.string().trim().min(2),
  businessBrief: z.string().trim().min(10).max(140),
  category: z.enum(MERCHANT_CATEGORIES),
  /**
   * Channel mix. Old clients still send the legacy `isOnline` boolean
   * which is mapped to ONLINE/LOCAL in `normaliseMerchantType` before
   * write. New clients post `merchantType` directly.
   */
  merchantType: z.enum(MERCHANT_TYPES).optional(),
  isOnline: z.boolean().optional(),
  country: z.string().trim().default(""),
  city: z.string().trim().default(""),
  fullAddress: z.string().trim().default(""),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  website: z.string().trim().regex(WEBSITE_REGEX, "Website must start with http:// or https://"),
  logoUrl: z.string().trim().regex(WEBSITE_REGEX, "Logo URL must start with http:// or https://"),
  heroImageUrl: z.string().trim().regex(WEBSITE_REGEX, "Hero image URL must start with http:// or https://"),
  promoCode: optionalNonEmpty(z.string().trim()),
  discountDetails: z.string().trim().min(4),
  socialPlatform: z.enum(SOCIAL_PLATFORMS).optional(),
  socialHandle: optionalNonEmpty(z.string().trim().min(1).max(60)),
} as const;

/**
 * Resolve the merchantType / isOnline pair from whatever the client
 * sent. New clients send `merchantType` and we derive `isOnline` from
 * it for back-compat. Old clients send only `isOnline` and we
 * upgrade them to a merchantType ("ONLINE" or "LOCAL"). HYBRID can
 * only be expressed via the new field, so legacy callers can't
 * accidentally land on it.
 */
export function normaliseMerchantType(value: {
  merchantType?: MerchantTypeValue;
  isOnline?: boolean;
}): { merchantType: MerchantTypeValue; isOnline: boolean; hasPhysicalLocation: boolean } {
  const explicit = value.merchantType;
  if (explicit) {
    return {
      merchantType: explicit,
      isOnline: explicit === "ONLINE",
      hasPhysicalLocation: explicit !== "ONLINE",
    };
  }
  const isOnline = value.isOnline === true;
  return {
    merchantType: isOnline ? "ONLINE" : "LOCAL",
    isOnline,
    hasPhysicalLocation: !isOnline,
  };
}

function validateChannelFields(
  value: { merchantType?: MerchantTypeValue; isOnline?: boolean; country?: string; city?: string; fullAddress?: string; promoCode?: string },
  ctx: z.RefinementCtx,
) {
  const resolved = normaliseMerchantType(value);
  // Promo code is mandatory whenever there's an online checkout, since
  // there's no in-person pass scan to fall back to on the web.
  const requiresPromoCode =
    resolved.merchantType === "ONLINE" || resolved.merchantType === "HYBRID";
  if (requiresPromoCode && (!value.promoCode || value.promoCode.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["promoCode"],
      message:
        resolved.merchantType === "HYBRID"
          ? "Hybrid merchants must provide a promo code for online orders."
          : "Online merchants must provide a promo code.",
    });
  }
  // Address fields are mandatory whenever there's a physical storefront.
  if (resolved.hasPhysicalLocation) {
    if (!value.country) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "Country is required." });
    }
    if (!value.city) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["city"], message: "City is required." });
    }
    if (!value.fullAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fullAddress"], message: "Full address is required." });
    }
  }
}

export const listingDraftSchema = z
  .object({
    ...baseListingShape,
    status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
  })
  .superRefine(validateChannelFields);

export const adminListingEditSchema = z
  .object({
    ...baseListingShape,
    status: z
      .enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"])
      .optional(),
    adminNotes: z.string().trim().max(2000).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .superRefine(validateChannelFields);

export function deriveMerchantId(input: { merchantId?: string; businessName: string }): string {
  const clean = input.merchantId?.trim();
  if (clean) return clean;
  return toSlug(input.businessName) || "new-merchant";
}
