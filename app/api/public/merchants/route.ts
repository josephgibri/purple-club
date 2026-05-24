import { db } from "@/lib/db";
import { MERCHANT_CATEGORIES, type MerchantType } from "@/data/merchants";

const USE_DB_LISTINGS = process.env.USE_DB_LISTINGS === "true";

export async function GET(): Promise<Response> {
  if (!USE_DB_LISTINGS) {
    return Response.json({ merchants: [], source: "disabled" });
  }

  const listings = await db.merchantListing.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
  });

  const merchants = listings.map((item) => {
    // Fall back to the legacy isOnline boolean for any pre-hybrid
    // rows whose merchantType column was added after their creation.
    const rawType = (item.merchantType ?? (item.isOnline ? "ONLINE" : "LOCAL")) as MerchantType;
    const merchantType: MerchantType =
      rawType === "ONLINE" || rawType === "LOCAL" || rawType === "HYBRID"
        ? rawType
        : "LOCAL";
    const coverage =
      merchantType === "ONLINE"
        ? "Worldwide"
        : merchantType === "HYBRID"
          ? `${item.city}, ${item.country} · Also online`
          : `${item.city}, ${item.country}`;
    return {
      id: item.merchantId,
      name: item.businessName,
      category: MERCHANT_CATEGORIES.includes(item.category as (typeof MERCHANT_CATEGORIES)[number])
        ? (item.category as (typeof MERCHANT_CATEGORIES)[number])
        : "professional_services",
      isOnline: merchantType === "ONLINE",
      merchantType,
      country: item.country,
      city: item.city,
      fullAddress: item.fullAddress,
      discount: item.promoCode ? `${item.discountDetails} (Code: ${item.promoCode})` : item.discountDetails,
      locationOrCoverage: coverage,
      description: item.businessBrief,
      logoUrl: item.logoUrl,
      heroImageUrl: item.heroImageUrl,
      promoCode: item.promoCode ?? undefined,
      // The drawer's "Visit Website" CTA reads from `ctaHref`. Without
      // this mapping it falls back to "#" and the click does nothing —
      // exactly what was happening on Purple Stay in prod. Default the
      // label too so it shows the same copy as bundled merchants.
      ctaHref: item.website || undefined,
      ctaLabel: item.website ? "Visit Website" : undefined,
      verificationHint: item.approvedAt ? "Approved by Purple Club admin." : undefined,
      lat: item.lat ?? undefined,
      lng: item.lng ?? undefined,
      socialPlatform: item.socialPlatform ?? undefined,
      socialHandle: item.socialHandle ?? undefined,
    };
  });

  return Response.json({ merchants, source: "db" });
}
