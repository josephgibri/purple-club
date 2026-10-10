import Link from "next/link";
import { redirect } from "next/navigation";

import { MerchantAuthPanel } from "@/components/auth/merchant-auth-panel";
import { getSession } from "@/lib/auth";

export default async function JoinPage() {
  const session = await getSession();
  if (session) {
    redirect("/merchant/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
          List a place
        </p>
        <h1 className="club-display mt-3 text-3xl text-[var(--bone)]">
          Your customers are already in the club.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--bone-dim)]">
          Hold 1 PBTC. Submit the business: name, category, location, the member
          benefit. We verify and list you in Places. Members show up. You apply
          the discount at the counter. The club never touches the money.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-[var(--bone)]">1. Hold 1 PBTC</h2>
            <p className="mt-2 text-sm text-[var(--bone-dim)]">
              One token, held, not spent. It is the key. It is not an investment.
            </p>
          </article>
          <article className="rounded-lg border border-[var(--line)] bg-[var(--wall-3)] p-4">
            <h2 className="text-sm font-semibold text-[var(--bone)]">2. Submit the place</h2>
            <p className="mt-2 text-sm text-[var(--bone-dim)]">
              Name, category, location, and the discount you will honor.
            </p>
          </article>
          <article className="rounded-lg border border-[var(--line)] bg-[var(--wall-3)] p-4">
            <h2 className="text-sm font-semibold text-[var(--bone)]">3. Members show up</h2>
            <p className="mt-2 text-sm text-[var(--bone-dim)]">
              You apply the discount at your counter. No commission, no escrow.
            </p>
          </article>
        </section>

        <div className="mt-8">
          <MerchantAuthPanel />
        </div>

        <div className="mt-8 text-sm text-violet-100/70">
          <Link href="/" className="underline underline-offset-4">
            Back to Purple Club
          </Link>
        </div>
      </div>
    </main>
  );
}
