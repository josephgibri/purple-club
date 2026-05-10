import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminListingEditSchema, deriveMerchantId } from "@/lib/dbSchemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await db.merchantListing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return Response.json({ error: "Listing not found." }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = adminListingEditSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const merchantId = deriveMerchantId(data);

  const duplicate = await db.merchantListing.findFirst({
    where: { merchantId, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) {
    return Response.json(
      { error: `Merchant slug "${merchantId}" already exists.` },
      { status: 409 },
    );
  }

  const nextStatus = data.status ?? existing.status;
  const isApproving = nextStatus === "APPROVED";
  const isRejecting = nextStatus === "REJECTED";

  const listing = await db.$transaction(async (tx) => {
    const updated = await tx.merchantListing.update({
      where: { id },
      data: {
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
        fsqId: data.fsqId ?? null,
        fsqName: data.fsqName ?? null,
        fsqAddress: data.fsqAddress ?? null,
        adminNotes: data.adminNotes ?? null,
        status: nextStatus,
        rejectionReason: isRejecting ? (data.rejectionReason ?? "Rejected by admin.") : null,
        approvedAt: isApproving ? new Date() : null,
      },
    });

    await tx.listingReview.create({
      data: {
        listingId: id,
        adminUserId: session.uid,
        action: isApproving ? "APPROVED" : isRejecting ? "REJECTED" : "EDITED",
        notes:
          isApproving
            ? "Approved with admin edits."
            : isRejecting
              ? data.rejectionReason ?? "Rejected by admin."
              : "Edited by admin.",
      },
    });

    return updated;
  });

  return Response.json({ ok: true, listing });
}
