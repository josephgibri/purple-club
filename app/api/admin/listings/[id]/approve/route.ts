import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendListingApprovedEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const listing = await db.merchantListing.update({
    where: { id },
    data: {
      status: "APPROVED",
      rejectionReason: null,
      approvedAt: new Date(),
      reviews: {
        create: {
          adminUserId: session.uid,
          action: "APPROVED",
          notes: "Approved from admin dashboard.",
        },
      },
    },
    include: {
      profile: { include: { user: { select: { email: true } } } },
    },
  });

  void sendListingApprovedEmail({
    to: listing.profile.user.email,
    businessName: listing.businessName,
    merchantId: listing.merchantId,
  });

  return Response.json({ ok: true, listing });
}
