"use client";

import { useCallback } from "react";

import type { ListingEventType } from "@/lib/analytics";

/**
 * Client-side analytics helper.
 *
 * Uses `navigator.sendBeacon` first so the request survives page
 * navigation (critical for WEBSITE_CLICK + MAPS_CLICK — those open
 * a new tab and may unmount the React tree before a `fetch` resolves).
 * Falls back to `fetch` with `keepalive: true` for browsers that
 * block sendBeacon (some privacy extensions).
 *
 * All event posts are fire-and-forget: failures are swallowed so a
 * blocked tracker never breaks the user-facing interaction.
 */

export type ClientEventType = Exclude<ListingEventType, "PASS_SCAN">;

const TRACK_ENDPOINT = "/api/track";

export function useListingTracking() {
  const trackEvent = useCallback(
    (merchantId: string, eventType: ClientEventType) => {
      if (typeof window === "undefined" || !merchantId) return;
      const body = JSON.stringify({
        merchantId,
        eventType,
        referrer: typeof document !== "undefined" ? document.referrer : "",
      });
      try {
        if (typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon(TRACK_ENDPOINT, blob)) return;
        }
      } catch {
        // sendBeacon throws on some configurations; fall through.
      }
      try {
        void fetch(TRACK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          credentials: "omit",
        });
      } catch {
        // Last-resort fallback failed — nothing else to do.
      }
    },
    [],
  );

  return { trackEvent };
}
