"use client";

import { ProductGate } from "@/components/access/product-gate";
import { ListPlaceForm } from "@/components/places/list-place-form";

export default function ListBusinessPage() {
  return (
    <ProductGate
      eyebrow="Business"
      connectTitle="Sign in to list a place"
      connectDescription="Connect the wallet that holds the key."
      unlockOnVerified
    >
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col gap-6 px-6 py-8 sm:py-10">
        <header>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Business</p>
          <h1 className="club-display mt-2 text-3xl text-[var(--bone)]">Your business</h1>
        </header>
        <ListPlaceForm />
      </main>
    </ProductGate>
  );
}
