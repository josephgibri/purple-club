import type { Metadata } from "next";
import { Suspense } from "react";

import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = {
  title: "Welcome · Purple Club",
  description:
    "Get a Solana wallet, grab 1 PBTC, and unlock the Purple Club discount network.",
};

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeClient />
    </Suspense>
  );
}
