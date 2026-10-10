import type { Metadata } from "next";

import { PerksClient } from "@/app/perks/perks-client";

export const metadata: Metadata = {
  title: "Places · Purple Club",
  description:
    "The directory. Members list a business and give other members a discount at the counter.",
};

export default function PlacesPage() {
  return <PerksClient />;
}
