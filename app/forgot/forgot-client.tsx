"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotClient() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      // Always succeed in the UI regardless of whether the email
      // matched a real account — the backend is intentionally vague
      // for the same reason. Email is the only confirmation channel.
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallow — we still tell the user "check your inbox" because
      // surfacing transport errors would let an attacker probe.
    } finally {
      setIsLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="grid gap-4 text-sm text-violet-100/85">
        <p>
          If an account exists for <strong className="text-white">{email}</strong>, we just
          sent a password reset link. It expires in 30 minutes.
        </p>
        <p className="text-xs text-violet-100/65">
          Didn&apos;t arrive? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="underline underline-offset-2 hover:text-white"
          >
            try a different email
          </button>
          .
        </p>
        <Link
          href="/join"
          className="mt-2 inline-flex w-fit items-center gap-1 text-xs uppercase tracking-[0.18em] text-violet-100/70 hover:text-white"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="text-violet-100/85">Account email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
        />
      </label>
      <button
        type="submit"
        disabled={isLoading || email.trim() === ""}
        className="rounded-xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
      >
        {isLoading ? "Sending…" : "Send reset link"}
      </button>
      <Link
        href="/join"
        className="text-center text-xs uppercase tracking-[0.18em] text-violet-100/65 hover:text-white"
      >
        ← Back to sign in
      </Link>
    </form>
  );
}
