import type { Metadata } from "next";

// Admin surfaces (concierge desk, gifts, campaigns, burns) are entirely
// internal — agents and founders only. Keep them out of every search
// index, regardless of any future SSR rehydration.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function TravelAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
