import { db } from "@/lib/db";
import { MERCHANT_CATEGORIES } from "@/data/merchants";

const USE_DB_LISTINGS = process.env.USE_DB_LISTINGS === "true";

export async function GET(): Promise<Response> {
  if (!USE_DB_LISTINGS) {
    return Response.json({ merchants: [], source: "disabled" });
  }

  const listings = await db.merchantListing.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
  });

  const merchants = listings.map((item) => ({
    id: item.merchantId,
    name: item.businessName,
    category: MERCHANT_CATEGORIES.includes(item.category as (typeof MERCHANT_CATEGORIES)[number])
      ? (item.category as (typeof MERCHANT_CATEGORIES)[number])
      : "professional_services",
    isOnline: item.isOnline,
    country: item.country,
    city: item.city,
    fullAddress: item.fullAddress,
    discount: item.promoCode ? `${item.discountDetails} (Code: ${item.promoCode})` : item.discountDetails,
    locationOrCoverage: item.isOnline ? "Worldwide" : `${item.city}, ${item.country}`,
    description: item.businessBrief,
    logoUrl: item.logoUrl,
    heroImageUrl: item.heroImageUrl,
    promoCode: item.promoCode ?? undefined,
    verificationHint: item.approvedAt ? "Approved by Purple Club admin." : undefined,
    lat: item.lat ?? undefined,
    lng: item.lng ?? undefined,
    socialPlatform: item.socialPlatform ?? undefined,
    socialHandle: item.socialHandle ?? undefined,
  }));

  return Response.json({ merchants, source: "db" });
}
