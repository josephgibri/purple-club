"use client";

import { useEffect, useMemo, useState } from "react";

type Listing = {
  id: string;
  merchantId: string;
  businessName: string;
  businessBrief: string;
  category: string;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  updatedAt: string;
  website: string;
  logoUrl: string;
  heroImageUrl: string;
  profile: { user: { email: string; username: string } };
};

const FILTERS = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DRAFT"] as const;

export function AdminReviewsClient() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("SUBMITTED");
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const selected = useMemo(
    () => listings.find((listing) => listing.id === selectedId) ?? null,
    [listings, selectedId],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/listings?status=${encodeURIComponent(filter)}`);
    const data = (await res.json()) as { listings?: Listing[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to load listings.");
      setLoading(false);
      return;
    }
    const next = data.listings ?? [];
    setListings(next);
    if (next.length > 0) {
      setSelectedId((prev) => (prev && next.some((x) => x.id === prev) ? prev : next[0].id));
    } else {
      setSelectedId(null);
    }
    setLoading(false);
  }

  async function approve() {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/listings/${selected.id}/approve`, { method: "POST" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) setError(data.error ?? "Approve failed.");
    await load();
    setActionBusy(false);
  }

  async function reject() {
    if (!selected) return;
    const reason = window.prompt("Rejection reason (visible to merchant):", "Please provide higher-quality website/logo URLs.");
    if (!reason) return;
    setActionBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/listings/${selected.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) setError(data.error ?? "Reject failed.");
    await load();
    setActionBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold">Merchant Review Queue</h1>
        <p className="text-sm text-violet-100/75">
          Review merchant submissions, approve quality listings, or send feedback.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === status ? "bg-gold-accent text-black" : "bg-surface-muted text-violet-100/85"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border bg-surface p-4">
          {loading ? (
            <p className="text-sm text-violet-100/70">Loading queue...</p>
          ) : listings.length === 0 ? (
            <p className="text-sm text-violet-100/70">No listings in this state.</p>
          ) : (
            <div className="grid gap-2">
              {listings.map((listing) => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => setSelectedId(listing.id)}
                  className={`rounded-lg border p-3 text-left text-sm ${
                    selectedId === listing.id ? "border-gold-accent bg-gold-accent/10" : "border-border bg-surface-muted"
                  }`}
                >
                  <p className="font-semibold">{listing.businessName}</p>
                  <p className="mt-1 text-xs text-violet-100/70">{listing.profile.user.email}</p>
                  <p className="mt-1 text-xs text-violet-100/70">Status: {listing.status}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-border bg-surface p-5">
          {!selected ? (
            <p className="text-sm text-violet-100/75">Select a listing to review.</p>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{selected.businessName}</h2>
              <p className="text-sm text-violet-100/80">{selected.businessBrief}</p>
              <div className="grid gap-2 text-sm text-violet-100/80">
                <p><span className="text-violet-100/60">Merchant ID:</span> {selected.merchantId}</p>
                <p><span className="text-violet-100/60">Category:</span> {selected.category}</p>
                <p><span className="text-violet-100/60">Website:</span> {selected.website}</p>
                <p><span className="text-violet-100/60">Logo URL:</span> {selected.logoUrl}</p>
                <p><span className="text-violet-100/60">Hero URL:</span> {selected.heroImageUrl}</p>
                {selected.rejectionReason ? (
                  <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-amber-100">
                    Last rejection reason: {selected.rejectionReason}
                  </p>
                ) : null}
              </div>
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void approve()}
                  disabled={actionBusy}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void reject()}
                  disabled={actionBusy}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
