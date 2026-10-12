import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Purple Club",
  description: "Hold 1 PBTC. Get the member price.",
};

export default function TelegramLinkPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-6 py-16">
      <h1 className="club-display text-4xl text-[var(--bone)]">This door is closed</h1>
      <p className="mt-3 max-w-md text-sm text-[var(--bone-dim)]">
        Hold 1 PBTC. Get the member price.
      </p>
      <Link href="/" className="mt-8 text-xs uppercase tracking-[0.16em] text-[var(--bone)]">
        Back to the club
      </Link>
    </main>
  );
}
