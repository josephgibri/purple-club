import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetClient } from "@/app/reset/reset-client";

export const metadata: Metadata = {
  title: "Choose a new password · Purple Club",
  description: "Set a new password for your Purple Club merchant account.",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
          Account recovery
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-violet-100/75">
          Pick a strong password (8+ characters). You&apos;ll be signed in
          automatically once it&apos;s set.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <ResetClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
