import { z } from "zod";

import { toSlug, WEBSITE_REGEX } from "@/lib/merchantSchema";
import { MERCHANT_CATEGORIES, SOCIAL_PLATFORMS } from "@/data/merchants";

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
  fsqId: z.string().trim().min(1).optional(),
  fsqName: z.string().trim().min(1).optional(),
  fsqAddress: z.string().trim().min(1).optional(),
} as const;

export const listingDraftSchema = z
  .object({
    ...baseListingShape,
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

export const adminListingEditSchema = z
  .object({
    ...baseListingShape,
    status: z
      .enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"])
      .optional(),
    adminNotes: z.string().trim().max(2000).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
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
