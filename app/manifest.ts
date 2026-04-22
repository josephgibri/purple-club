import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Purple Club",
    short_name: "PurpleClub",
    description: "Token-gated merchant discount network for PBTC holders.",
    start_url: "/",
    display: "standalone",
    background_color: "#080512",
    theme_color: "#080512",
    orientation: "portrait",
    icons: [
      {
        src: "/purple-club-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
