import type { Metadata } from "next";

import { PassClient } from "./pass-client";

export const metadata: Metadata = {
  title: "My Pass · Purple Club",
  description: "Your live, scannable Purple Club membership pass.",
};

export default function PassPage() {
  return <PassClient />;
}
