import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const listings = await db.merchantListing.findMany({
    where: status ? { status: status as never } : undefined,
    include: {
      profile: {
        include: {
          user: {
            select: { email: true, username: true },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return Response.json({ listings });
}
