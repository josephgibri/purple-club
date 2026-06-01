import type { Metadata } from "next";

// Promoter portal lists minted invite codes — keeping them off public
// search indexes matches the same logic we apply to /claim and /invite:
// codes are private one-shots and shouldn't be discoverable through
// Google. The page is also wallet-gated (SIWS), but a stale snapshot
// in a search cache could still leak the code list.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function PromoterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
