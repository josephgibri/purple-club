import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deriveMerchantId,
  formatZodError,
  listingDraftSchema,
  normaliseMerchantType,
} from "@/lib/dbSchemas";

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
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  const { merchantType, isOnline, hasPhysicalLocation } = normaliseMerchantType(data);
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
      isOnline,
      merchantType,
      country: hasPhysicalLocation ? data.country : "",
      city: hasPhysicalLocation ? data.city : "",
      fullAddress: hasPhysicalLocation ? data.fullAddress : "",
      lat: hasPhysicalLocation ? data.lat : null,
      lng: hasPhysicalLocation ? data.lng : null,
      website: data.website,
      logoUrl: data.logoUrl,
      heroImageUrl: data.heroImageUrl,
      promoCode: data.promoCode,
      discountDetails: data.discountDetails,
      socialPlatform: data.socialPlatform,
      socialHandle: data.socialHandle,
      fsqId: data.fsqId ?? null,
      fsqName: data.fsqName ?? null,
      fsqAddress: data.fsqAddress ?? null,
      fsqVerifiedAt: data.fsqId ? new Date() : null,
      status: data.status === "DRAFT" ? "DRAFT" : "SUBMITTED",
    },
  });

  return Response.json({ ok: true, listing });
}
