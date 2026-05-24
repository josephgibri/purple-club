import { getSession } from "@/lib/auth";
import { searchAddress } from "@/lib/geocode";

export const runtime = "nodejs";

/**
 * Authenticated forward-geocode endpoint backed by OpenStreetMap
 * Nominatim. Returns address suggestions for an in-progress query
 * from the merchant onboarding form's address autocomplete.
 *
 * Auth-gated so we can't be turned into an open geocoding proxy —
 * Nominatim's free tier is shared infra and we don't want to burn
 * it for traffic that isn't from a logged-in merchant.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return Response.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }
  const countryCode = (url.searchParams.get("country") ?? "").trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? "8");

  try {
    const suggestions = await searchAddress({
      query,
      countryCode,
      limit: Number.isFinite(limit) ? limit : 8,
    });
    return Response.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Address lookup failed";
    // Soft-fail so the autocomplete UI shows the friendly "type freeform,
    // it'll still save" copy rather than scaring merchants with a 502.
    return Response.json(
      {
        error:
          "Address suggestions are temporarily unavailable. Type freeform — it'll still save.",
        detail: message,
      },
      { status: 503 },
    );
  }
}
