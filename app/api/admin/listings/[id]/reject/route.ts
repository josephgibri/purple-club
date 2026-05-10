import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rejectSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid reason" }, { status: 400 });
  }

  const listing = await db.merchantListing.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.reason,
      approvedAt: null,
      reviews: {
        create: {
          adminUserId: session.uid,
          action: "REJECTED",
          notes: parsed.data.reason,
        },
      },
    },
  });

  return Response.json({ ok: true, listing });
}
