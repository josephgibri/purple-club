import { getSession } from "@/lib/auth";
import { isFsqEnabled, searchPlaces } from "@/lib/foursquare";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!isFsqEnabled()) {
    return Response.json(
      { error: "Foursquare verification is not configured. Add FOURSQUARE_API_KEY." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return Response.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }
  const near = (url.searchParams.get("near") ?? "").trim() || undefined;
  const ll = (url.searchParams.get("ll") ?? "").trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? "8");

  try {
    const matches = await searchPlaces({
      query,
      near,
      ll,
      limit: Number.isFinite(limit) ? limit : 8,
    });
    return Response.json({ matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Foursquare lookup failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
