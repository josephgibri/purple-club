import { z } from "zod";

import { MERCHANT_CATEGORIES, SOCIAL_PLATFORMS } from "@/data/merchants";

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const WEBSITE_REGEX = /^https?:\/\/[^\s]+$/i;

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const urlField = z
  .string()
  .trim()
  .regex(WEBSITE_REGEX, "Must start with http:// or https://");

const emailField = z.string().trim().email("Invalid email");

const coordinate = z.number().finite();

const socialPlatformField = z.enum(SOCIAL_PLATFORMS);

const baseSubmissionFields = {
  businessName: z.string().trim().min(2).max(80),
  businessBrief: z.string().trim().min(10).max(140),
  category: z.enum(MERCHANT_CATEGORIES),
  isOnline: z.boolean(),
  country: z.string().trim().max(80).default(""),
  city: z.string().trim().max(80).default(""),
  fullAddress: z.string().trim().max(200).default(""),
  lat: coordinate.optional(),
  lng: coordinate.optional(),
  website: urlField,
  logoUrl: urlField,
  heroImageUrl: urlField,
  promoCode: z.string().trim().max(40).default(""),
  discountDetails: z.string().trim().min(4).max(200),
  socialPlatform: socialPlatformField.optional(),
  socialHandle: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^@+/, ""))
    .optional(),
  email: emailField,
};

/**
 * The shape posted from /join and /merchant/edit.
 * Validates independent of persistence shape; `apply-merchant-change.ts`
 * maps this into the narrower `merchantRecordSchema` (see below).
 */
export const submissionPayloadSchema = z
  .object({
    type: z.enum(["submit", "update", "remove"]),
    merchantId: z
      .string()
      .regex(SLUG_REGEX, "Invalid merchant id slug")
      .optional(),
    ...baseSubmissionFields,
    turnstileToken: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.isOnline) {
      if (!value.country)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["country"],
          message: "Country is required for physical stores",
        });
      if (!value.city)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["city"],
          message: "City is required for physical stores",
        });
      if (!value.fullAddress)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fullAddress"],
          message: "Full address is required for physical stores",
        });
    }

    // B8: online merchants must provide a promo code.
    if (value.isOnline && !value.promoCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promoCode"],
        message: "Online merchants must provide a promo code",
      });
    }

    if (value.type === "update" || value.type === "remove") {
      if (!value.merchantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["merchantId"],
          message: "merchantId is required for update/remove",
        });
      }
    }
  });

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

/**
 * Shape persisted to data/merchants.json.
 * Validated post-edit by the workflow to catch drift.
 */
export const merchantRecordSchema = z.object({
  id: z.string().regex(SLUG_REGEX),
  name: z.string().min(1),
  category: z.enum(MERCHANT_CATEGORIES),
  isOnline: z.boolean(),
  country: z.string(),
  city: z.string(),
  fullAddress: z.string(),
  discount: z.string(),
  locationOrCoverage: z.string(),
  description: z.string(),
  logoUrl: z.string(),
  heroImageUrl: z.string(),
  promoCode: z.string().optional(),
  isAnchor: z.boolean().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  verificationHint: z.string().optional(),
  lat: coordinate.optional(),
  lng: coordinate.optional(),
  socialPlatform: socialPlatformField.optional(),
  socialHandle: z.string().optional(),
});

export type MerchantRecord = z.infer<typeof merchantRecordSchema>;

export const merchantArraySchema = z.array(merchantRecordSchema);

/**
 * Derive verificationHint server-side (B7). Kept in schema so both the
 * relay preview and the workflow produce the same copy.
 */
export function deriveVerificationHint(payload: {
  isOnline: boolean;
  promoCode?: string;
}): string {
  if (payload.isOnline) {
    return payload.promoCode
      ? "Apply promo code at checkout with active Purple Club pass."
      : "Verified manually by Purple Club admin.";
  }
  return "Show active Purple Club pass before redeeming offer.";
}

/**
 * Map a SubmissionPayload into a MerchantRecord, normalizing physical fields.
 */
export function payloadToRecord(
  payload: SubmissionPayload,
): MerchantRecord {
  const id =
    payload.merchantId ?? (toSlug(payload.businessName) || "new-merchant");
  const isOnline = payload.isOnline;
  const locationOrCoverage = isOnline
    ? "Global"
    : [payload.city, payload.country].filter(Boolean).join(", ");

  const record: MerchantRecord = {
    id,
    name: payload.businessName,
    category: payload.category,
    isOnline,
    country: isOnline ? "" : payload.country,
    city: isOnline ? "" : payload.city,
    fullAddress: isOnline ? "" : payload.fullAddress,
    discount: payload.discountDetails,
    locationOrCoverage,
    description: payload.businessBrief,
    logoUrl: payload.logoUrl,
    heroImageUrl: payload.heroImageUrl,
    verificationHint: deriveVerificationHint(payload),
    ctaLabel: "Redeem Offer",
    ctaHref: payload.website,
  };

  if (payload.promoCode) record.promoCode = payload.promoCode;
  if (payload.socialPlatform && payload.socialHandle) {
    record.socialPlatform = payload.socialPlatform;
    record.socialHandle = payload.socialHandle;
  }
  if (!isOnline && typeof payload.lat === "number") record.lat = payload.lat;
  if (!isOnline && typeof payload.lng === "number") record.lng = payload.lng;

  return record;
}
