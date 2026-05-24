"use client";

/**
 * BasePathFetch — runtime fix-up for hardcoded `fetch("/api/...")` calls
 * when this app is mounted under a Next.js `basePath` (e.g., when served as
 * `purplehub.co/club` via the Purple Bitcoin hub).
 *
 * Without this, code like `fetch("/api/foo")` would resolve to
 * `purplehub.co/api/foo` (404) instead of `purplehub.co/club/api/...`.
 * Patching `window.fetch` once at mount means every existing call site
 * keeps working without an audit.
 *
 * No-op when `NEXT_PUBLIC_BASE_PATH` is empty (standalone dev).
 */

import { useEffect } from "react";

declare global {
  interface Window {
    __purpleBasePathPatched?: boolean;
  }
}

export function BasePathFetch() {
  useEffect(() => {
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
    if (!basePath) return;
    if (typeof window === "undefined") return;
    if (window.__purpleBasePathPatched) return;
    window.__purpleBasePathPatched = true;

    const orig = window.fetch.bind(window);
    window.fetch = function patched(input, init) {
      try {
        if (
          typeof input === "string" &&
          input.startsWith("/") &&
          !input.startsWith("//") &&
          !input.startsWith(`${basePath}/`) &&
          input !== basePath
        ) {
          return orig(`${basePath}${input}`, init);
        }
        if (input instanceof Request) {
          const url = input.url;
          const here = window.location.origin;
          if (
            url.startsWith(`${here}/`) &&
            !url.startsWith(`${here}${basePath}/`) &&
            url !== `${here}${basePath}`
          ) {
            const rewritten = new Request(
              url.replace(here, `${here}${basePath}`),
              input,
            );
            return orig(rewritten, init);
          }
        }
      } catch {
        // Fall through to the original fetch on any parsing mishap.
      }
      return orig(input, init);
    } as typeof fetch;
  }, []);

  return null;
}
