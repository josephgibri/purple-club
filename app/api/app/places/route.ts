import { merchants as bundledMerchants } from "@/data/merchants";
import { addressHoldsKey, readAppAccount } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

export async function GET(request: Request) {
  const account = await readAppAccount(request);
  if (!account?.address) return appJson({ error: "Sign in again." }, 401);
  if (!(await addressHoldsKey(account.address))) {
    return appJson({ error: "Hold 1 PBTC to open Places." }, 403);
  }

  const fromBundle = bundledMerchants.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    city: merchant.city,
    country: merchant.country,
    discount: merchant.discount,
  }));

  if (process.env.USE_DB_LISTINGS !== "true") {
    return appJson({ places: fromBundle });
  }

  const listings = await prisma.merchantListing.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      merchantId: true,
      businessName: true,
      city: true,
      country: true,
      discountDetails: true,
    },
  });
  const dbIds = new Set(listings.map((item) => item.merchantId));
  const places = [
    ...listings.map((item) => ({
      id: item.merchantId,
      name: item.businessName,
      city: item.city,
      country: item.country,
      discount: item.discountDetails,
    })),
    ...fromBundle.filter((item) => !dbIds.has(item.id)),
  ];
  return appJson({ places });
}
