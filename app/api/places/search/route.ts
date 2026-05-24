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
    // Map upstream auth + rate-limit + 5xx errors to 503 so the
    // AddressAutocomplete's existing graceful-degradation branch
    // catches them and shows the friendly "type freeform, it'll save"
    // copy. A surfaced 401 / 502 string would otherwise scare merchants
    // mid-onboarding.
    const upstreamStatus = parseUpstreamStatus(message);
    if (upstreamStatus === 401 || upstreamStatus === 403 || upstreamStatus === 429 || (upstreamStatus !== null && upstreamStatus >= 500)) {
      return Response.json(
        { error: "Address suggestions are temporarily unavailable. Type freeform — it'll still save." },
        { status: 503 },
      );
    }
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * Extract an HTTP status code from an error string of the form
 * "Foursquare error 401: …" so we can route auth/rate-limit failures
 * to the soft 503 fallback instead of surfacing them as 502s.
 */
function parseUpstreamStatus(message: string): number | null {
  const match = /Foursquare error\s+(\d{3})/i.exec(message);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}
