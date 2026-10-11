"use client";

import { ProductGate } from "@/components/access/product-gate";
import { DogMark } from "@/components/brand/dog-mark";
import { CommunityCard } from "@/components/telegram/community-card";

const BLOCKS = [
  {
    title: "Built by the people in it",
    body: "Nobody owns this club. No company, no dev, no treasury to walk off with. It belongs to everyone holding a key.",
  },
  {
    title: "Friendships, not follower counts",
    body: "Members meet here, ask each other straight questions, and lift each other up. Businesses get customers. People get partners, advice and friends.",
  },
  {
    title: "Nobody here is competing with you",
    body: "Everyone wins when the person next to them wins. That's the whole point of being keyed in.",
  },
] as const;

const GET = [
  "A key that means something",
  "Discounts from member businesses",
  "5% off hotels, through our travel partner",
  "Titles you earn, never buy",
] as const;

export function CommunityClient() {
  return (
    <ProductGate
      eyebrow="Community"
      connectTitle="Hold the key"
      connectDescription="One PBTC is the door. Connect the wallet that holds it."
    >
      <CommunityRoom />
    </ProductGate>
  );
}

function CommunityRoom() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-6 py-10 sm:py-14">
      <DogMark size={72} />
      <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Community</p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)] sm:text-5xl">The room</h1>
      <p className="mt-3 text-sm text-[var(--bone)]">Hold the key. Walk in.</p>
      <p className="mt-2 max-w-md text-sm text-[var(--bone-dim)]">
        One PBTC is the door. What&apos;s behind it is the people.
      </p>

      <section className="mt-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">How to get in</p>
        <ol className="mt-3 space-y-2 text-sm text-[var(--bone)]">
          <li>1. Hold at least 1 PBTC.</li>
          <li>2. Connect Telegram. Tap the button.</li>
          <li>3. Tap Start in the bot. The invite comes back here.</li>
        </ol>
        <div className="mt-5">
          <CommunityCard />
        </div>
      </section>

      <section className="mt-10 space-y-6">
        {BLOCKS.map((block) => (
          <div key={block.title}>
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone)]">{block.title}</h2>
            <p className="mt-2 text-sm text-[var(--bone-dim)]">{block.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone)]">Where we live</h2>
        <p className="mt-2 text-sm text-[var(--bone-dim)]">
          Everything happens in one place — the Telegram group. Announcements, deals, travel,
          arguments, jokes. If it is a conversation, it is there.
        </p>
        <p className="mt-2 text-sm text-[var(--bone-dim)]">
          The app keeps the record. The group keeps the club alive.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">What you get</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--bone)]">
          {GET.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm text-[var(--bone)]">Held, not bought.</p>
      <p className="mt-6 text-xs text-[var(--bone-faint)]">
        No Council here. No promises. No paperwork. Just the room.
      </p>
    </main>
  );
}
