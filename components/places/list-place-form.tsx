"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  CATEGORY_LABELS,
  MERCHANT_CATEGORIES,
  type MerchantCategory,
} from "@/data/merchants";

function clubApi(path: string) {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  return `${basePath}${path}`;
}

type Kind = "physical" | "online";

type PlaceListing = {
  businessName: string;
  category: string;
  kind: Kind;
  where: string;
  promoCode: string;
  discount: string;
  email: string;
  status: string;
  rejectionReason: string | null;
};

type FormState = {
  businessName: string;
  category: MerchantCategory;
  kind: Kind;
  where: string;
  promoCode: string;
  discount: string;
  email: string;
};

const EMPTY: FormState = {
  businessName: "",
  category: "retail_goods",
  kind: "physical",
  where: "",
  promoCode: "",
  discount: "",
  email: "",
};

function isCategory(value: string): value is MerchantCategory {
  return (MERCHANT_CATEGORIES as readonly string[]).includes(value);
}

const LABEL = "block text-[11px] uppercase tracking-[0.16em] text-[var(--bone-faint)]";
const FIELD =
  "mt-1 w-full border border-[var(--line)] bg-[var(--wall)] px-3 py-2 text-sm text-[var(--bone)] outline-none";

export function ListPlaceForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(clubApi("/api/places/list"), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { listing?: PlaceListing | null; email?: string };
        if (cancelled) return;
        const listing = data.listing;
        if (listing) {
          setExisting(true);
          setStatus(listing.status);
          setRejection(listing.rejectionReason);
          setForm({
            businessName: listing.businessName,
            category: isCategory(listing.category) ? listing.category : "retail_goods",
            kind: listing.kind === "online" ? "online" : "physical",
            where: listing.where,
            promoCode: listing.promoCode,
            discount: listing.discount,
            email: listing.email || data.email || "",
          });
        } else if (data.email) {
          setForm((current) => ({ ...current, email: data.email ?? "" }));
        }
      } catch {
        // Submit reports its own error.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch(clubApi("/api/places/list"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string; listing?: PlaceListing };
      if (!res.ok || !data.listing) {
        setError(data.error || "Could not save the place.");
        return;
      }
      setExisting(true);
      setStatus(data.listing.status);
      setRejection(data.listing.rejectionReason);
      setSaved(true);
      router.push("/account/business");
    } catch {
      setError("Could not save the place.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--bone-dim)]">Loading…</p>;
  }

  const physical = form.kind === "physical";

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="grid gap-5">
      {existing ? (
        <p className="text-sm text-[var(--bone)]">
          {status === "APPROVED"
            ? "Listed."
            : status === "REJECTED"
              ? rejection
                ? `Sent back. ${rejection}`
                : "Sent back."
              : "Received. It will show in Places after it is checked."}
        </p>
      ) : (
        <p className="text-sm text-[var(--bone-dim)]">
          A physical place shows the member pass at the counter. An online place gives members a promo code.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setForm({ ...form, kind: "physical" })}
          className={`border px-3 py-3 text-left text-sm ${
            physical
              ? "border-[var(--ink)] bg-[var(--wall-3)] text-[var(--bone)]"
              : "border-[var(--line)] text-[var(--bone-dim)]"
          }`}
        >
          <span className="block text-[11px] uppercase tracking-[0.16em]">Physical</span>
          <span className="mt-1 block text-xs">Members show their pass.</span>
        </button>
        <button
          type="button"
          onClick={() => setForm({ ...form, kind: "online" })}
          className={`border px-3 py-3 text-left text-sm ${
            form.kind === "online"
              ? "border-[var(--ink)] bg-[var(--wall-3)] text-[var(--bone)]"
              : "border-[var(--line)] text-[var(--bone-dim)]"
          }`}
        >
          <span className="block text-[11px] uppercase tracking-[0.16em]">Online</span>
          <span className="mt-1 block text-xs">Members use a promo code.</span>
        </button>
      </div>

      <label className={LABEL}>
        Business name
        <input
          required
          minLength={2}
          maxLength={80}
          value={form.businessName}
          onChange={(event) => setForm({ ...form, businessName: event.target.value })}
          className={FIELD}
        />
      </label>

      <label className={LABEL}>
        Category
        <select
          value={form.category}
          onChange={(event) =>
            setForm({
              ...form,
              category: isCategory(event.target.value) ? event.target.value : "retail_goods",
            })
          }
          className={FIELD}
        >
          {MERCHANT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>

      {physical ? (
        <label className={LABEL}>
          Where
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.where}
            onChange={(event) => setForm({ ...form, where: event.target.value })}
            className={FIELD}
          />
        </label>
      ) : (
        <label className={LABEL}>
          Promo code
          <input
            required
            minLength={2}
            maxLength={40}
            value={form.promoCode}
            onChange={(event) => setForm({ ...form, promoCode: event.target.value })}
            className={FIELD}
          />
        </label>
      )}

      <label className={LABEL}>
        Discount
        <input
          required
          minLength={4}
          maxLength={200}
          value={form.discount}
          onChange={(event) => setForm({ ...form, discount: event.target.value })}
          className={FIELD}
        />
      </label>

      <label className={LABEL}>
        Email
        <input
          required
          type="email"
          maxLength={254}
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          className={FIELD}
        />
      </label>

      {physical ? (
        <p className="text-sm text-[var(--bone-dim)]">
          At the counter, the member shows their pass. You apply the discount. No code.
        </p>
      ) : (
        <p className="text-sm text-[var(--bone-dim)]">
          Members enter this code at your checkout. The club never takes the payment.
        </p>
      )}

      {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-[var(--ok)]">
          Received. It will show in Places after it is checked.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)] disabled:opacity-60"
        >
          {busy ? "Saving…" : existing ? "Save changes" : "List a place"}
        </button>
        <Link href="/account/business" className="text-sm text-[var(--bone-dim)]">
          Back to business
        </Link>
      </div>
    </form>
  );
}
