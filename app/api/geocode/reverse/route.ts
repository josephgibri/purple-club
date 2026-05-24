import { getSession } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geocode";

export const runtime = "nodejs";

/**
 * Reverse-geocoding endpoint backed by OpenStreetMap Nominatim.
 * Used by `LocationMapPicker` so that dragging the pin auto-fills
 * the address field below the map. This is the single biggest
 * onboarding-flow simplification: a merchant who can find their
 * shop on the map never has to type an address at all.
 *
 * Auth-gated so we can't be turned into an open geocoding proxy.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required numbers." }, { status: 400 });
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Coordinates out of range." }, { status: 400 });
  }

  try {
    const suggestion = await reverseGeocode(lat, lng);
    return Response.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reverse geocode failed";
    return Response.json(
      {
        error:
          "Couldn't resolve that pin to an address. Drop it again or type the address by hand.",
        detail: message,
      },
      { status: 503 },
    );
  }
}
