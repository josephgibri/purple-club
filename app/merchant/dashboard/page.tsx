import { redirect } from "next/navigation";

import { MerchantDashboardClient } from "@/app/merchant/dashboard/dashboard-client";
import { getSession } from "@/lib/auth";

export default async function MerchantDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/join");
  if (session.role !== "MERCHANT" && session.role !== "ADMIN") redirect("/");

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <MerchantDashboardClient session={session} />
    </main>
  );
}
