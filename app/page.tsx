import { EnterClubCta } from "@/components/landing/enter-club-cta";
import { DogMark } from "@/components/brand/dog-mark";

/**
 * Outsider wall. A locked door, not a pitch.
 * The wall stays here. Enter sends a holder to You after they sign.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <DogMark size={168} />
      <h1 className="club-display mt-8 text-4xl text-[var(--bone)] sm:text-6xl">
        Purple <span className="text-[var(--ink)]">Club</span>
      </h1>
      <p className="mt-4 max-w-sm text-sm tracking-wide text-[var(--bone-dim)]">
        Hold 1 PBTC. That is the key.
      </p>
      <div className="mt-8 w-full max-w-sm">
        <EnterClubCta />
      </div>
    </main>
  );
}
