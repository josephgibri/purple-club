"use client";

import { useEffect, useMemo, useState } from "react";

import { MERCHANT_CATEGORIES, type MerchantCategory, SOCIAL_PLATFORMS, type SocialPlatform } from "@/data/merchants";

type ListingStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

type Listing = {
  id: string;
  merchantId: string;
  businessName: string;
  businessBrief: string;
  category: MerchantCategory;
  isOnline: boolean;
  country: string;
  city: string;
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  website: string;
  logoUrl: string;
  heroImageUrl: string;
  promoCode: string | null;
  discountDetails: string;
  socialPlatform: SocialPlatform | null;
  socialHandle: string | null;
  fsqId: string | null;
  fsqName: string | null;
  fsqAddress: string | null;
  fsqVerifiedAt: string | null;
  adminNotes: string | null;
  status: ListingStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  updatedAt: string;
  profile: { user: { email: string; username: string } };
};

type FormState = {
  merchantId: string;
  businessName: string;
  businessBrief: string;
  category: MerchantCategory;
  isOnline: boolean;
  country: string;
  city: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
  website: string;
  logoUrl: string;
  heroImageUrl: string;
  promoCode: string;
  discountDetails: string;
  socialPlatform: SocialPlatform | "";
  socialHandle: string;
  fsqId: string;
  fsqName: string;
  fsqAddress: string;
  adminNotes: string;
  status: ListingStatus;
  rejectionReason: string;
};

const FILTERS: ListingStatus[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DRAFT"];

const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  retail_goods: "Retail & Goods",
  dining_nightlife: "Dining & Nightlife",
  tech_digital: "Tech & Digital",
  travel_leisure: "Travel & Leisure",
  wellness_beauty: "Wellness & Beauty",
  professional_services: "Professional Services",
};

function listingToForm(l: Listing): FormState {
  return {
    merchantId: l.merchantId,
    businessName: l.businessName,
    businessBrief: l.businessBrief,
    category: l.category,
    isOnline: l.isOnline,
    country: l.country,
    city: l.city,
    fullAddress: l.fullAddress,
    lat: l.lat ?? undefined,
    lng: l.lng ?? undefined,
    website: l.website,
    logoUrl: l.logoUrl,
    heroImageUrl: l.heroImageUrl,
    promoCode: l.promoCode ?? "",
    discountDetails: l.discountDetails,
    socialPlatform: l.socialPlatform ?? "",
    socialHandle: l.socialHandle ?? "",
    fsqId: l.fsqId ?? "",
    fsqName: l.fsqName ?? "",
    fsqAddress: l.fsqAddress ?? "",
    adminNotes: l.adminNotes ?? "",
    status: l.status,
    rejectionReason: l.rejectionReason ?? "",
  };
}

function emailDomain(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function websiteDomain(website: string): string {
  try {
    const host = new URL(website).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function AdminReviewsClient() {
  const [filter, setFilter] = useState<ListingStatus>("SUBMITTED");
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const selected = useMemo(
    () => listings.find((listing) => listing.id === selectedId) ?? null,
    [listings, selectedId],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(listingToForm(selected));
      setEditing(false);
    } else {
      setForm(null);
    }
  }, [selected]);

  async function load() {
    setLoading(true);
    setError(null);
    setMessage(null);
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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setError(null);
    setMessage(null);
  }

  async function saveEdits(targetStatus?: ListingStatus): Promise<boolean> {
    if (!selected || !form) return false;
    setActionBusy(true);
    setError(null);
    const payload = {
      ...form,
      status: targetStatus ?? form.status,
      socialPlatform: form.socialPlatform || undefined,
      socialHandle: form.socialHandle || undefined,
      fsqId: form.fsqId || undefined,
      fsqName: form.fsqName || undefined,
      fsqAddress: form.fsqAddress || undefined,
      adminNotes: form.adminNotes || undefined,
      rejectionReason: targetStatus === "REJECTED" ? form.rejectionReason || undefined : undefined,
    };
    const res = await fetch(`/api/admin/listings/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not save edits.");
      setActionBusy(false);
      return false;
    }
    setMessage(
      targetStatus === "APPROVED"
        ? "Edits saved & merchant approved."
        : targetStatus === "REJECTED"
          ? "Rejection sent to merchant."
          : "Edits saved.",
    );
    await load();
    setActionBusy(false);
    setEditing(false);
    return true;
  }

  async function approveQuick() {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/listings/${selected.id}/approve`, { method: "POST" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) setError(data.error ?? "Approve failed.");
    else setMessage("Approved.");
    await load();
    setActionBusy(false);
  }

  async function rejectQuick() {
    if (!selected) return;
    const reason = window.prompt(
      "Rejection reason (visible to merchant):",
      "Please provide higher-quality website/logo URLs.",
    );
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
    else setMessage("Rejection sent.");
    await load();
    setActionBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold">Merchant Review Queue</h1>
        <p className="text-sm text-violet-100/75">
          Review submissions, edit any field, email merchants, then approve.
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
                    selectedId === listing.id
                      ? "border-gold-accent bg-gold-accent/10"
                      : "border-border bg-surface-muted"
                  }`}
                >
                  <p className="font-semibold">{listing.businessName}</p>
                  <p className="mt-1 text-xs text-violet-100/70">
                    {listing.profile.user.email}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
                    {listing.fsqId ? (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">
                        FSQ ✓
                      </span>
                    ) : null}
                    {emailDomain(listing.profile.user.email) === websiteDomain(listing.website) &&
                    websiteDomain(listing.website) ? (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">
                        Domain ✓
                      </span>
                    ) : null}
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-100">
                      {listing.status}
                    </span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-border bg-surface p-5">
          {!selected || !form ? (
            <p className="text-sm text-violet-100/75">Select a listing to review.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected.businessName}</h2>
                  <p className="text-xs uppercase tracking-[0.2em] text-violet-100/60">
                    {selected.merchantId} &middot; {selected.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`mailto:${selected.profile.user.email}?subject=${encodeURIComponent(
                      `Purple Club listing: ${selected.businessName}`,
                    )}`}
                    className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-violet-100"
                  >
                    Email merchant
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing((v) => !v);
                      if (!editing) setForm(listingToForm(selected));
                    }}
                    className="rounded-xl border border-gold-accent/60 bg-gold-accent/10 px-3 py-2 text-xs font-semibold text-gold-accent"
                  >
                    {editing ? "Cancel edits" : "Edit listing"}
                  </button>
                </div>
              </div>

              <VerificationBadges listing={selected} />

              {selected.rejectionReason ? (
                <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                  Last rejection reason: {selected.rejectionReason}
                </p>
              ) : null}

              {!editing ? (
                <ReadOnlyView listing={selected} />
              ) : (
                <EditForm form={form} setField={setField} />
              )}

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveEdits()}
                      disabled={actionBusy}
                      className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Save edits
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdits("APPROVED")}
                      disabled={actionBusy}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                    >
                      Save & Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!form) return;
                        const reason = window.prompt(
                          "Rejection reason:",
                          form.rejectionReason || "",
                        );
                        if (!reason) return;
                        setForm({ ...form, rejectionReason: reason });
                        void saveEdits("REJECTED");
                      }}
                      disabled={actionBusy}
                      className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Save & Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void approveQuick()}
                      disabled={actionBusy}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void rejectQuick()}
                      disabled={actionBusy}
                      className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function VerificationBadges({ listing }: { listing: Listing }) {
  const userDomain = emailDomain(listing.profile.user.email);
  const siteDomain = websiteDomain(listing.website);
  const domainMatch = userDomain && siteDomain && userDomain === siteDomain;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge ok={Boolean(listing.fsqId)} label="Foursquare match" />
      <Badge ok={Boolean(domainMatch)} label="Email domain matches website" />
      <Badge ok={!listing.isOnline ? Boolean(listing.lat && listing.lng) : true} label="Has coordinates" />
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${
        ok
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
          : "border-rose-400/40 bg-rose-500/10 text-rose-200"
      }`}
    >
      {ok ? "✓ " : "✗ "}
      {label}
    </span>
  );
}

function ReadOnlyView({ listing }: { listing: Listing }) {
  return (
    <div className="grid gap-2 text-sm text-violet-100/85">
      <p className="text-violet-100/95">{listing.businessBrief}</p>
      <Row label="Category" value={listing.category} />
      <Row label="Type" value={listing.isOnline ? "Online / Global" : "Local / In-person"} />
      {!listing.isOnline ? (
        <>
          <Row label="City" value={`${listing.city}, ${listing.country}`} />
          <Row label="Address" value={listing.fullAddress} />
        </>
      ) : null}
      <Row label="Website" value={listing.website} />
      <Row label="Logo URL" value={listing.logoUrl} />
      <Row label="Hero URL" value={listing.heroImageUrl} />
      <Row label="Promo code" value={listing.promoCode ?? "—"} />
      <Row label="Discount" value={listing.discountDetails} />
      {listing.fsqId ? (
        <>
          <Row label="FSQ name" value={listing.fsqName ?? "—"} />
          <Row label="FSQ address" value={listing.fsqAddress ?? "—"} />
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-violet-100/55">{label}: </span>
      <span className="break-words">{value}</span>
    </p>
  );
}

function EditForm({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="grid gap-3">
      <Input label="Slug" value={form.merchantId} onChange={(v) => setField("merchantId", v)} />
      <Input label="Business name" value={form.businessName} onChange={(v) => setField("businessName", v)} />
      <Input label="Brief" value={form.businessBrief} onChange={(v) => setField("businessBrief", v)} />
      <Selector
        label="Category"
        value={form.category}
        onChange={(v) => setField("category", v as MerchantCategory)}
        options={MERCHANT_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]] as const)}
      />
      <Selector
        label="Type"
        value={form.isOnline ? "online" : "local"}
        onChange={(v) => setField("isOnline", v === "online")}
        options={[
          ["local", "Local / In-person"],
          ["online", "Online / Global"],
        ]}
      />
      {!form.isOnline ? (
        <>
          <Input label="City" value={form.city} onChange={(v) => setField("city", v)} />
          <Input label="Country" value={form.country} onChange={(v) => setField("country", v)} />
          <Input label="Full address" value={form.fullAddress} onChange={(v) => setField("fullAddress", v)} />
        </>
      ) : null}
      <Input label="Website" value={form.website} onChange={(v) => setField("website", v)} />
      <Input label="Logo URL" value={form.logoUrl} onChange={(v) => setField("logoUrl", v)} />
      <Input label="Hero URL" value={form.heroImageUrl} onChange={(v) => setField("heroImageUrl", v)} />
      <Input label="Promo code" value={form.promoCode} onChange={(v) => setField("promoCode", v)} />
      <Input
        label="Discount details"
        value={form.discountDetails}
        onChange={(v) => setField("discountDetails", v)}
      />
      <Selector
        label="Social platform"
        value={form.socialPlatform || ""}
        onChange={(v) => setField("socialPlatform", v as SocialPlatform | "")}
        options={[["", "None"], ...SOCIAL_PLATFORMS.map((p) => [p, p] as const)]}
      />
      <Input label="Social handle" value={form.socialHandle} onChange={(v) => setField("socialHandle", v.replace(/^@+/, ""))} />
      <Input label="Foursquare ID" value={form.fsqId} onChange={(v) => setField("fsqId", v)} />
      <Input label="Foursquare name" value={form.fsqName} onChange={(v) => setField("fsqName", v)} />
      <Input label="Foursquare address" value={form.fsqAddress} onChange={(v) => setField("fsqAddress", v)} />
      <label className="grid gap-1 text-sm">
        <span className="text-violet-100/85">Admin notes (internal)</span>
        <textarea
          rows={3}
          value={form.adminNotes}
          onChange={(e) => setField("adminNotes", e.target.value)}
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
        />
      </label>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-violet-100/85">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
      />
    </label>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-violet-100/85">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
