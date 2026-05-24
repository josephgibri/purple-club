import type { NextConfig } from "next";

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

export default nextConfig;
