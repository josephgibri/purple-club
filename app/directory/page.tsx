import type { Metadata } from "next";

import { DirectoryClient } from "./directory-client";

export const metadata: Metadata = {
  title: "Directory · Purple Club",
  description:
    "Browse the full Purple Club merchant directory and live promo codes.",
};

export default function DirectoryPage() {
  return <DirectoryClient />;
}
