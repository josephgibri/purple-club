import type { Metadata } from "next";

import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify a Pass · Purple Club",
  description:
    "Scan a Purple Club membership pass and get an instant on-chain yes/no.",
};

type VerifyPageProps = {
  searchParams: Promise<{ t?: string; m?: string }>;
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { t, m } = await searchParams;
  const token = typeof t === "string" && t.length > 0 ? t : null;
  const initialMerchantId =
    typeof m === "string" && m.length > 0 ? m : null;
  return <VerifyClient initialToken={token} initialMerchantId={initialMerchantId} />;
}
