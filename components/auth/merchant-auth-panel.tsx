"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export function MerchantAuthPanel() {
  const [mode, setMode] = useState<Mode>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    identifier: "",
    email: "",
    username: "",
    displayName: "",
    password: "",
  });
  const router = useRouter();

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { identifier: form.identifier, password: form.password }
          : {
              email: form.email,
              username: form.username,
              displayName: form.displayName || form.username,
              password: form.password,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Authentication failed.");
        setIsLoading(false);
        return;
      }
      router.push("/merchant/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            mode === "login" ? "bg-gold-accent text-black" : "bg-surface-muted text-violet-100/80"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            mode === "register" ? "bg-gold-accent text-black" : "bg-surface-muted text-violet-100/80"
          }`}
        >
          Create Merchant Account
        </button>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        {mode === "login" ? (
          <label className="grid gap-1 text-sm">
            <span className="text-violet-100/85">Email or Username</span>
            <input
              value={form.identifier}
              onChange={(e) => setField("identifier", e.target.value)}
              className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="merchant@brand.com or merchant_username"
            />
          </label>
        ) : (
          <>
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Business Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
                placeholder="merchant@brand.com"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Username</span>
              <input
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
                placeholder="funburgers"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Display Name</span>
              <input
                value={form.displayName}
                onChange={(e) => setField("displayName", e.target.value)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
                placeholder="Fun Burgers"
              />
            </label>
          </>
        )}
        <label className="grid gap-1 text-sm">
          <span className="text-violet-100/85">Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
            placeholder="At least 8 characters"
          />
        </label>
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isLoading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
        </button>
      </form>
    </div>
  );
}
