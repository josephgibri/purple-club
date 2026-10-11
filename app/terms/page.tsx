import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms · Purple Club",
  description: "What the club is, and what it is not.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Legal</p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)]">Terms</h1>
      <p className="mt-3 text-sm text-[var(--bone-dim)]">
        Purple Club. Hold 1 PBTC and you are in. These terms describe the club as it
        operates. They are not an offer of a financial product.
      </p>

      <article className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--bone-dim)]">
        <section>
          <h2 className="text-base text-[var(--bone)]">1. What the club is</h2>
          <p className="mt-2">
            Purple Club is a membership network. It is not a company you are contracting
            with for goods, travel, or credit. It is not a financial intermediary. It does
            not hold member money, does not pass money between members, and takes no cut
            of a discount or a booking.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">2. The key</h2>
          <p className="mt-2">
            Holding 1 PBTC is the club key. It is access, not an investment, not a deposit,
            and not a promise of profit, yield, or a particular discount. The club does not
            custody the token. Verification is a read of the wallet.
          </p>
          <p className="mt-2">
            A council key is separate. It comes from contribution to the treasury and gives
            voting weight. It is not a rank, and it pays nothing.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">3. Places</h2>
          <p className="mt-2">
            A place is a member&apos;s business listed in the directory. The member offers
            other members a discount. That discount is applied by the business, at the point
            of sale, directly to the member. The contract is between the member and the
            business. The club never touches that money. There is no escrow, wallet, or
            balance inside the club for a place.
          </p>
          <p className="mt-2">
            A listing can be removed. One bad experience is the network&apos;s problem, and
            the club may take a listing down.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">4. Stays</h2>
          <p className="mt-2">
            Stays are booked with a licensed travel partner, not with the club. The
            member&apos;s contract is with that partner. The member pays the partner. The
            club earns nothing from the booking: no margin, no commission, no fee, no float.
          </p>
          <p className="mt-2">The offer, when the partner can hold it, is:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Book through the club&apos;s travel partner.</li>
            <li>Same room, same dates — 5% off the public rate.</li>
            <li>
              0.25% of booking value is used by the travel partner, from its own margin, to
              buy PBTC on the open market and burn it.
            </li>
            <li>You pay the agency, not the club.</li>
          </ul>
          <p className="mt-2">
            The club does not guarantee a room, a rate, a refund, or that a burn will
            occur. Cancellations follow the partner&apos;s and the supplier&apos;s rules.
            The club is not responsible for the stay itself.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">5. Quests and titles</h2>
          <p className="mt-2">
            Quests and titles are cosmetic. They unlock nothing but the title. They are not
            transferable, not a token, and not a claim on anything the club holds — the club
            holds nothing of yours.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">6. What is not offered</h2>
          <p className="mt-2">
            The club does not offer holder rewards, over-the-counter trading, peer-to-peer
            lending, or a weekly lottery. It does not run an in-app feed, comments, or
            direct messages. Conversation is on Telegram.
          </p>
        </section>

        <section>
          <h2 className="text-base text-[var(--bone)]">7. Liability</h2>
          <p className="mt-2">
            To the extent the law allows, the club is not liable for a merchant&apos;s
            service, a hotel&apos;s service, a delay, or a loss that follows from using a
            place or a stay. The club&apos;s role is the directory, the request, and the
            record.
          </p>
        </section>
      </article>

      <p className="mt-10">
        <Link href="/" className="text-xs uppercase tracking-[0.16em] text-[var(--bone)]">
          Back
        </Link>
      </p>
    </main>
  );
}
