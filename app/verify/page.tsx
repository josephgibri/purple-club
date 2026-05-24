import type { Metadata } from "next";

import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify a Pass · Purple Club",
  description:
    "Scan a Purple Club membership pass and get an instant on-chain yes/no.",
};

type VerifyPageProps = {
  searchParams: Promise<{ t?: string }>;
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { t } = await searchParams;
  const token = typeof t === "string" && t.length > 0 ? t : null;
  return <VerifyClient initialToken={token} />;
}
