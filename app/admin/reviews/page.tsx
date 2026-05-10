import { redirect } from "next/navigation";

import { AdminReviewsClient } from "@/app/admin/reviews/reviews-client";
import { getSession } from "@/lib/auth";

export default async function AdminReviewsPage() {
  const session = await getSession();
  if (!session) redirect("/join");
  if (session.role !== "ADMIN") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-100">
          You are logged in as a merchant account. Only admin accounts can access the review queue.
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
