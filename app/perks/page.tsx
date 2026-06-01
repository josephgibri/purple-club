import type { Metadata } from "next";

import { PerksClient } from "./perks-client";

export const metadata: Metadata = {
  title: "Perks & Benefits · Purple Club",
  description:
    "Browse the full Purple Club partner directory and live promo codes — unlocked for PBTC holders.",
};

export default function PerksPage() {
  return <PerksClient />;
}
