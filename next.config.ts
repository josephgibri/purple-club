import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Env-gated basePath. When `NEXT_PUBLIC_BASE_PATH=/club` is set this app
 * mounts under `/club` (so it can be served as a sub-path of the Purple
 * Bitcoin hub at purplehub.co/club). When unset, it runs at `/` like
 * normal — preserves the standalone dev experience.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. The allowlist is derived from what the app actually
 * loads at runtime:
 *   - script:  self + Telegram Login Widget (telegram.org). 'unsafe-inline' is
 *              required for Next's hydration bootstrap + the next-pwa SW
 *              registration; 'unsafe-eval' is added in dev only for HMR.
 *   - style:   self + Leaflet CSS from unpkg (merchant map). 'unsafe-inline'
 *              covers Next's injected critical CSS + inline style attributes.
 *   - img:     any https (token icons, Unsplash, Vercel Blob, Leaflet marker
 *              icons on unpkg, OpenStreetMap tiles, merchant logos). Images
 *              cannot execute, so a broad https allowance is low-risk.
 *   - connect: self (covers the /api/rpc proxy + all API routes; Nominatim
 *              geocoding runs server-side) + Jupiter price/quote. ws/wss in dev
 *              for HMR.
 *   - frame:   self + the Telegram OAuth login iframe.
 * If a future integration is blocked, check the browser console for the CSP
 * violation and add the host here (or temporarily switch the header name to
 * "Content-Security-Policy-Report-Only" while debugging).
 */
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'self'`,
  `form-action 'self'`,
  `script-src 'self' 'unsafe-inline' https://telegram.org${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' https://unpkg.com`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https://lite-api.jup.ag${isDev ? " ws: wss:" : ""}`,
  `frame-src 'self' https://oauth.telegram.org`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // Turbopack is the default in Next.js 16. The empty object silences the
  // "webpack config but no turbopack config" error raised by @ducanh2912/next-pwa.
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

const withPWA = withPWAInit({
  dest: "public",
  // Don't register the SW in dev — hot-reload and SW caching fight each other.
  disable: process.env.NODE_ENV === "development",
  // Pre-cache the app shell; don't cache dynamic API routes.
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Offline fallback page (rendered when network and cache both miss).
  fallbacks: {
    document: "/offline",
  },
});

export default withPWA(nextConfig);
