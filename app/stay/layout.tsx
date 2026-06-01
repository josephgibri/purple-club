import type { Metadata } from "next";

// The dashboard renders member-only quoted rates (the closed-user-group
// pricing that powers our parity-clause defence). Even though the page is
// client-rendered behind a wallet gate, we explicitly opt out of indexing
// to make sure no shell, error state, or future SSR hydration can leak a
// rate into a search engine cache.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function TravelDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
