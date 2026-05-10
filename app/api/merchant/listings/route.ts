import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { deriveMerchantId, listingDraftSchema } from "@/lib/dbSchemas";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.merchantProfile.findUnique({
    where: { userId: session.uid },
    include: {
      listings: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  return Response.json({
    profile: profile
      ? {
          id: profile.id,
          displayName: profile.displayName,
          listings: profile.listings,
        }
      : null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const data = parsed.data;
  const merchantId = deriveMerchantId(data);

  const profile = await db.merchantProfile.findUnique({
    where: { userId: session.uid },
    select: { id: true },
  });
  if (!profile) {
    return Response.json({ error: "Merchant profile not found." }, { status: 404 });
  }

  const duplicate = await db.merchantListing.findFirst({
    where: {
      merchantId,
      NOT: { merchantProfileId: profile.id },
    },
    select: { id: true },
  });
  if (duplicate) {
    return Response.json({ error: `Merchant slug "${merchantId}" already exists.` }, { status: 409 });
  }

  const listing = await db.merchantListing.create({
    data: {
      merchantProfileId: profile.id,
      merchantId,
      businessName: data.businessName,
      businessBrief: data.businessBrief,
      category: data.category,
      isOnline: data.isOnline,
      country: data.isOnline ? "" : data.country,
      city: data.isOnline ? "" : data.city,
      fullAddress: data.isOnline ? "" : data.fullAddress,
      lat: data.isOnline ? null : data.lat,
      lng: data.isOnline ? null : data.lng,
      website: data.website,
      logoUrl: data.logoUrl,
      heroImageUrl: data.heroImageUrl,
      promoCode: data.promoCode,
      discountDetails: data.discountDetails,
      socialPlatform: data.socialPlatform,
      socialHandle: data.socialHandle,
      status: data.status === "DRAFT" ? "DRAFT" : "SUBMITTED",
    },
  });

  return Response.json({ ok: true, listing });
}
