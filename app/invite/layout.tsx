import type { Metadata } from "next";

// Invite/campaign claim pages identify a recipient slug and may render
// claim status. Keep them out of search indexes for the same reason as
// /claim — codes and slugs aren't meant to be discoverable via Google.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
