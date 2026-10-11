import type { Metadata } from "next";

import { CommunityClient } from "./community-client";

export const metadata: Metadata = {
  title: "Community · Purple Club",
  description: "Hold the key. Walk in. The group is where the club lives.",
};

export default function CommunityPage() {
  return <CommunityClient />;
}
