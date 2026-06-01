import type { Metadata } from "next";

// Claim pages carry one-time gift codes in the URL. Indexing them would
// expose codes to anyone running a Google query, breaking the trust
// model. Keep them off the index entirely.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
