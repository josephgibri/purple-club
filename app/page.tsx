import { EnterClubCta } from "@/components/landing/enter-club-cta";
import { DogMark } from "@/components/brand/dog-mark";

/**
 * Outsider wall. A locked door, not a pitch.
 * Members who already hold the key are sent to You by EnterClubCta.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <DogMark size={168} />
      <p className="mt-8 text-[11px] uppercase tracking-[0.28em] text-[var(--bone-faint)]">
        The wall
      </p>
      <h1 className="club-display mt-3 text-4xl text-[var(--bone)] sm:text-6xl">
        Purple <span className="text-[var(--ink)]">Club</span>
      </h1>
      <p className="mt-4 max-w-sm text-sm tracking-wide text-[var(--bone-dim)]">
        Hold 1 PBTC. That is the key.
      </p>
      <div className="mt-8 w-full max-w-sm">
        <EnterClubCta redirectOnEnter />
      </div>
    </main>
  );
}
