import { z } from "zod";

import { toSlug, WEBSITE_REGEX } from "@/lib/merchantSchema";
import { MERCHANT_CATEGORIES, SOCIAL_PLATFORMS } from "@/data/merchants";

export const registerSchema = z.object({
  email: z.string().trim().email(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dot, dash, underscore"),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(8).max(128),
});

export const listingDraftSchema = z
  .object({
    merchantId: z.string().trim().min(2).optional(),
    businessName: z.string().trim().min(2),
    businessBrief: z.string().trim().min(10).max(140),
    category: z.enum(MERCHANT_CATEGORIES),
    isOnline: z.boolean(),
    country: z.string().trim().default(""),
    city: z.string().trim().default(""),
    fullAddress: z.string().trim().default(""),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    website: z.string().trim().regex(WEBSITE_REGEX, "Website must start with http:// or https://"),
    logoUrl: z.string().trim().regex(WEBSITE_REGEX, "Logo URL must start with http:// or https://"),
    heroImageUrl: z.string().trim().regex(WEBSITE_REGEX, "Hero image URL must start with http:// or https://"),
    promoCode: z.string().trim().optional(),
    discountDetails: z.string().trim().min(4),
    socialPlatform: z.enum(SOCIAL_PLATFORMS).optional(),
    socialHandle: z.string().trim().min(1).max(60).optional(),
    status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
  })
  .superRefine((value, ctx) => {
    if (value.isOnline) {
      if (!value.promoCode || value.promoCode.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["promoCode"],
          message: "Online merchants must provide a promo code.",
        });
      }
      return;
    }
    if (!value.country) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "Country is required." });
    }
    if (!value.city) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["city"], message: "City is required." });
    }
    if (!value.fullAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fullAddress"], message: "Full address is required." });
    }
  });

export function deriveMerchantId(input: { merchantId?: string; businessName: string }): string {
  const clean = input.merchantId?.trim();
  if (clean) return clean;
  return toSlug(input.businessName) || "new-merchant";
}
