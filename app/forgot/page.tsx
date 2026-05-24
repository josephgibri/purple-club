import type { Metadata } from "next";

import { ForgotClient } from "@/app/forgot/forgot-client";

export const metadata: Metadata = {
  title: "Reset your password · Purple Club",
  description: "Send yourself a link to reset your Purple Club merchant password.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-accent">
          Account recovery
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-violet-100/75">
          Enter the email you used to sign up — we&apos;ll email you a one-time link
          to set a new password.
        </p>
        <div className="mt-6">
          <ForgotClient />
        </div>
      </div>
    </main>
  );
}
