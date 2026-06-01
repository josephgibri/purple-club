import { hasPerksAdminAccess, readSession } from "@/lib/wallet-session";
import { db } from "@/lib/db";
import {
  adminListingEditSchema,
  deriveMerchantId,
  formatZodError,
  normaliseMerchantType,
} from "@/lib/dbSchemas";
import { sendListingApprovedEmail, sendListingRejectedEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const session = await readSession();
  if (!session || !hasPerksAdminAccess(session.wallet)) {
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
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  const { merchantType, isOnline, hasPhysicalLocation } = normaliseMerchantType(data);
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
        adminNotes: data.adminNotes ?? null,
        status: nextStatus,
        rejectionReason: isRejecting ? (data.rejectionReason ?? "Rejected by admin.") : null,
        approvedAt: isApproving ? new Date() : null,
      },
    });

    await tx.listingReview.create({
      data: {
        listingId: id,
        adminWallet: session.wallet,
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

  if (existing.status !== "APPROVED" && isApproving) {
    const profile = await db.merchantProfile.findUnique({
      where: { id: listing.merchantProfileId },
      include: { user: { select: { email: true } } },
    });
    if (profile?.user.email) {
      void sendListingApprovedEmail({
        to: profile.user.email,
        businessName: listing.businessName,
        merchantId: listing.merchantId,
      });
    }
  } else if (existing.status !== "REJECTED" && isRejecting) {
    const profile = await db.merchantProfile.findUnique({
      where: { id: listing.merchantProfileId },
      include: { user: { select: { email: true } } },
    });
    if (profile?.user.email) {
      void sendListingRejectedEmail({
        to: profile.user.email,
        businessName: listing.businessName,
        reason: data.rejectionReason ?? "Please review and resubmit.",
      });
    }
  }

  return Response.json({ ok: true, listing });
}
