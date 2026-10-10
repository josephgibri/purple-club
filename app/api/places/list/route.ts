import { z } from "zod";

import { CATEGORY_HERO_FALLBACK, MERCHANT_CATEGORIES } from "@/data/merchants";
import { db } from "@/lib/db";
import { deriveMerchantId } from "@/lib/dbSchemas";
import { normalizeEmail, sendListingSubmittedAdminEmail } from "@/lib/email";
import { readSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

const listPlaceSchema = z
  .object({
    businessName: z.string().trim().min(2).max(80),
    category: z.enum(MERCHANT_CATEGORIES),
    kind: z.enum(["physical", "online"]),
    where: z.string().trim().max(120).default(""),
    promoCode: z.string().trim().max(40).default(""),
    discount: z.string().trim().min(4).max(200),
    email: z.string().trim().email().max(254),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "physical" && value.where.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["where"], message: "where" });
    }
    if (value.kind === "online" && value.promoCode.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["promoCode"], message: "promo" });
    }
  });

type PlaceRow = {
  id: string;
  merchantId: string;
  businessName: string;
  category: string;
  merchantType: string;
  city: string;
  fullAddress: string;
  promoCode: string | null;
  discountDetails: string;
  status: string;
  rejectionReason: string | null;
  updatedAt: Date;
};

function placeView(listing: PlaceRow, email: string) {
  const online = listing.merchantType === "ONLINE";
  return {
    id: listing.id,
    merchantId: listing.merchantId,
    businessName: listing.businessName,
    category: listing.category,
    kind: online ? "online" : "physical",
    where: listing.city || listing.fullAddress,
    promoCode: listing.promoCode ?? "",
    discount: listing.discountDetails,
    email,
    status: listing.status,
    rejectionReason: listing.rejectionReason,
    updatedAt: listing.updatedAt.toISOString(),
  };
}

async function requireMember() {
  const session = await readSession();
  if (!session) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!(session.pbtcBalance >= 1)) {
    return Response.json({ error: "Hold 1 PBTC to list a place." }, { status: 403 });
  }
  return session;
}

export async function GET(): Promise<Response> {
  const session = await requireMember();
  if (session instanceof Response) return session;

  const user = await db.user.findUnique({
    where: { wallet: session.wallet },
    select: {
      email: true,
      place: true,
    },
  });

  return Response.json({
    email: user?.email ?? "",
    listing: user?.place ? placeView(user.place, user.email ?? "") : null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireMember();
  if (session instanceof Response) return session;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = listPlaceSchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === "businessName"
        ? "Enter the business name."
        :       field === "where"
          ? "Enter where it is."
          : field === "promoCode"
            ? "Enter the promo code members use."
            : field === "discount"
            ? "Enter the discount members get."
            : field === "email"
              ? "Enter a valid email."
              : field === "category"
                ? "Choose a category."
                : "Check the form and try again.";
    return Response.json({ error: message }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  if (!email) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const { businessName, category, kind, where, promoCode, discount } = parsed.data;
  const online = kind === "online";
  const merchantId = deriveMerchantId({ businessName });
  const hero = CATEGORY_HERO_FALLBACK[category];
  const brief = (online ? `${businessName}. ${discount}` : `${businessName} in ${where}.`).slice(0, 140);

  const user = await db.user.upsert({
    where: { wallet: session.wallet },
    update: { email },
    create: { wallet: session.wallet, email },
    select: { id: true, place: { select: { id: true } } },
  });

  const duplicate = await db.merchantListing.findFirst({
    where: {
      merchantId,
      ...(user.place ? { NOT: { id: user.place.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    return Response.json(
      { error: "A place with that name is already listed. Change the name." },
      { status: 409 },
    );
  }

  const data = {
    merchantId,
    businessName,
    businessBrief: brief,
    category,
    isOnline: online,
    merchantType: online ? "ONLINE" : "LOCAL",
    country: "",
    city: online ? "" : where,
    fullAddress: online ? "" : where,
    website: "",
    logoUrl: hero,
    heroImageUrl: hero,
    promoCode: online ? promoCode : null,
    discountDetails: discount,
    socialPlatform: null,
    socialHandle: null,
    status: "SUBMITTED" as const,
    rejectionReason: null,
    approvedAt: null,
  };

  const listing = user.place
    ? await db.merchantListing.update({
        where: { id: user.place.id },
        data,
      })
    : await db.merchantListing.create({
        data: {
          ...data,
          userId: user.id,
        },
      });

  await sendListingSubmittedAdminEmail({
    businessName: listing.businessName,
    merchantId: listing.merchantId,
    action: user.place ? "updated" : "submitted",
  });

  return Response.json({
    ok: true,
    listing: placeView(listing, email),
  });
}
