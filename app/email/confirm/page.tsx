import type { Metadata } from "next";
import Link from "next/link";

import { DogMark } from "@/components/brand/dog-mark";
import { confirmEmailVerification } from "@/lib/email-verify";

export const metadata: Metadata = {
  title: "Email · Purple Club",
  description: "Confirm the email on your Purple Club profile.",
};

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function EmailConfirmPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const verified = await confirmEmailVerification(typeof token === "string" ? token : "");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-6 py-16">
      <DogMark size={72} />
      <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">Email</p>
      <h1 className="club-display mt-2 text-4xl text-[var(--bone)]">
        {verified ? "Email verified" : "Link expired"}
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--bone-dim)]">
        {verified
          ? "This address can be used for a stay. Return to your profile."
          : "Ask for a new link from your profile, under the wallet."}
      </p>
      <Link
        href="/account"
        className="mt-8 inline-flex w-fit items-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
      >
        Your profile
      </Link>
    </main>
  );
}
