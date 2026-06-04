import { Suspense } from "react";
import type { Metadata } from "next";
import { TelegramLinkClient } from "./telegram-link-client";

export const metadata: Metadata = {
  title: "Link Telegram · Purple Club",
  description: "Verify your Solana wallet to join the Purple Club Telegram community.",
};

export default function TelegramLinkPage() {
  return (
    <main className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 py-16">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-purple-accent/20 blur-3xl" />
      <Suspense>
        <TelegramLinkClient />
      </Suspense>
    </main>
  );
}
