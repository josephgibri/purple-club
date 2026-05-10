import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

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
  });

  return Response.json({ ok: true, listing });
}
