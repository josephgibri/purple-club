/**
 * One-shot migration: rebrand the legacy "Purple Travel" anchor merchant
 * to "Purple Stay" and reparent it onto a specific merchant account.
 *
 * Run with:
 *   npx tsx scripts/rename-purple-travel-to-stay.ts
 *
 * Idempotent — re-running just no-ops or harmlessly re-applies the
 * canonical values. Safe to re-run after deploys.
 */

import { PrismaClient } from "@prisma/client";

const OWNER_EMAIL = "josephgibri@gmail.com";

const NEXT_SLUG = "purple-stay";
const LEGACY_SLUGS = ["purple-travel", "purple-stay"];

const CANONICAL = {
  merchantId: NEXT_SLUG,
  businessName: "Purple Stay",
  businessBrief: "Up to 20% discount in over 250K hotels around the world.",
  category: "travel_leisure",
  merchantType: "ONLINE",
  isOnline: true,
  country: "",
  city: "",
  fullAddress: "",
  lat: null as number | null,
  lng: null as number | null,
  website: "https://www.purplestay.co",
  logoUrl: "https://www.purplestay.co/icon-512.png",
  heroImageUrl:
    "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=80",
  // PurpleStay gates the discount via on-chain PBTC ownership at the
  // wallet — there is no traditional checkout promo code. We leave
  // the column null so the directory rendering doesn't append a
  // misleading "(Code: ...)" suffix to the discount string.
  promoCode: null as string | null,
  discountDetails: "Up to 20% off wholesale rates · auto-applied at checkout for 1 PBTC holders",
  socialPlatform: null as string | null,
  socialHandle: null as string | null,
};

const db = new PrismaClient();

async function main() {
  const user = await db.merchant.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(
      `No User row found for ${OWNER_EMAIL}. Sign up at /join first, then re-run this script.`,
    );
  }

  const profile = await db.merchantProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: CANONICAL.businessName,
    },
    update: {},
    select: { id: true, displayName: true },
  });

  // Hand off any pre-existing rows on either of the legacy slugs and
  // pick a single "winner" listing we'll then bring up to the
  // canonical state. Doing it this way means we never violate the
  // unique merchantId constraint, even if both slugs already exist.
  const existing = await db.merchantListing.findMany({
    where: { merchantId: { in: LEGACY_SLUGS } },
    orderBy: { updatedAt: "desc" },
  });

  let winner = existing[0] ?? null;

  // Burn any stale duplicates so the unique slug rename below is safe.
  for (const row of existing.slice(1)) {
    console.log(
      `Deleting duplicate listing ${row.id} (slug=${row.merchantId}, status=${row.status})`,
    );
    await db.merchantListing.delete({ where: { id: row.id } });
  }

  if (!winner) {
    console.log(`No existing Purple Travel/Stay listing — creating fresh.`);
    winner = await db.merchantListing.create({
      data: {
        merchantProfileId: profile.id,
        merchantId: CANONICAL.merchantId,
        businessName: CANONICAL.businessName,
        businessBrief: CANONICAL.businessBrief,
        category: CANONICAL.category,
        isOnline: CANONICAL.isOnline,
        merchantType: CANONICAL.merchantType,
        country: CANONICAL.country,
        city: CANONICAL.city,
        fullAddress: CANONICAL.fullAddress,
        lat: CANONICAL.lat,
        lng: CANONICAL.lng,
        website: CANONICAL.website,
        logoUrl: CANONICAL.logoUrl,
        heroImageUrl: CANONICAL.heroImageUrl,
        promoCode: CANONICAL.promoCode,
        discountDetails: CANONICAL.discountDetails,
        socialPlatform: CANONICAL.socialPlatform,
        socialHandle: CANONICAL.socialHandle,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });
    console.log(`Created listing ${winner.id} owned by ${user.email}.`);
    await db.$disconnect();
    return;
  }

  console.log(
    `Updating listing ${winner.id} (was: slug=${winner.merchantId}, name="${winner.businessName}", owner=${winner.merchantProfileId})`,
  );

  await db.merchantListing.update({
    where: { id: winner.id },
    data: {
      merchantProfileId: profile.id,
      merchantId: CANONICAL.merchantId,
      businessName: CANONICAL.businessName,
      businessBrief: CANONICAL.businessBrief,
      category: CANONICAL.category,
      isOnline: CANONICAL.isOnline,
      merchantType: CANONICAL.merchantType,
      country: CANONICAL.country,
      city: CANONICAL.city,
      fullAddress: CANONICAL.fullAddress,
      lat: CANONICAL.lat,
      lng: CANONICAL.lng,
      website: CANONICAL.website,
      logoUrl: CANONICAL.logoUrl,
      heroImageUrl: CANONICAL.heroImageUrl,
      promoCode: CANONICAL.promoCode,
      discountDetails: CANONICAL.discountDetails,
      socialPlatform: CANONICAL.socialPlatform,
      socialHandle: CANONICAL.socialHandle,
      status: "APPROVED",
      approvedAt: winner.approvedAt ?? new Date(),
      rejectionReason: null,
    },
  });

  console.log(
    `Done. Listing ${winner.id} is now "${CANONICAL.businessName}" → ${CANONICAL.website}, owned by ${user.email}.`,
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
