import { AdminReviewsClient } from "@/app/admin/reviews/reviews-client";
import { hasPerksAdminAccess, readSession } from "@/lib/wallet-session";

export default async function AdminReviewsPage() {
  const session = await readSession();
  if (!session || !hasPerksAdminAccess(session.wallet)) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-100">
          The Perks review queue is restricted to founder and Perks-admin wallets.
          Connect an authorized wallet from{" "}
          <a href="/account" className="underline">
            My Account
          </a>{" "}
          to continue.
        </div>
      </main>
    );
  }
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <AdminReviewsClient />
    </main>
  );
}
