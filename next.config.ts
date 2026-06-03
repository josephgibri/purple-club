import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Env-gated basePath. When `NEXT_PUBLIC_BASE_PATH=/club` is set this app
 * mounts under `/club` (so it can be served as a sub-path of the Purple
 * Bitcoin hub at purplehub.co/club). When unset, it runs at `/` like
 * normal — preserves the standalone dev experience.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
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
