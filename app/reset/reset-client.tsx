"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ResetClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = (searchParams.get("token") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="grid gap-4 text-sm text-violet-100/85">
        <p>This reset link is missing its token. Please request a new one.</p>
        <Link
          href="/forgot"
          className="inline-flex w-fit rounded-xl bg-gold-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black"
        >
          Get a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not reset your password.");
        setIsLoading(false);
        return;
      }
      // Server signs us in on success — bounce straight to dashboard.
      router.replace("/merchant/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-violet-100/85">New password</span>
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-violet-100/55 hover:text-violet-100"
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-violet-100/85">Confirm new password</span>
        <input
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          autoComplete="new-password"
          placeholder="Re-enter the password"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
        />
      </label>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={isLoading}
        className="rounded-xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
      >
        {isLoading ? "Updating…" : "Set new password"}
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
