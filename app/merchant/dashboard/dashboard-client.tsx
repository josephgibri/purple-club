"use client";

import { useEffect, useMemo, useState } from "react";

import { CityAutocomplete, type CitySelection } from "@/components/join/city-autocomplete";
import { MERCHANT_CATEGORIES, type MerchantCategory, SOCIAL_PLATFORMS, type SocialPlatform } from "@/data/merchants";
import type { SessionPayload } from "@/lib/auth";

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
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  updatedAt: string;
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
  status: "DRAFT" | "SUBMITTED";
};

const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  retail_goods: "Retail & Goods",
  dining_nightlife: "Dining & Nightlife",
  tech_digital: "Tech & Digital",
  travel_leisure: "Travel & Leisure",
  wellness_beauty: "Wellness & Beauty",
  professional_services: "Professional Services",
};

const EMPTY_FORM: FormState = {
  merchantId: "",
  businessName: "",
  businessBrief: "",
  category: "retail_goods",
  isOnline: false,
  country: "",
  city: "",
  fullAddress: "",
  website: "",
  logoUrl: "",
  heroImageUrl: "",
  promoCode: "",
  discountDetails: "",
  socialPlatform: "",
  socialHandle: "",
  status: "SUBMITTED",
};

function mapListingToForm(listing: Listing): FormState {
  return {
    merchantId: listing.merchantId,
    businessName: listing.businessName,
    businessBrief: listing.businessBrief,
    category: listing.category,
    isOnline: listing.isOnline,
    country: listing.country,
    city: listing.city,
    fullAddress: listing.fullAddress,
    lat: listing.lat ?? undefined,
    lng: listing.lng ?? undefined,
    website: listing.website,
    logoUrl: listing.logoUrl,
    heroImageUrl: listing.heroImageUrl,
    promoCode: listing.promoCode ?? "",
    discountDetails: listing.discountDetails,
    socialPlatform: listing.socialPlatform ?? "",
    socialHandle: listing.socialHandle ?? "",
    status: listing.status === "DRAFT" ? "DRAFT" : "SUBMITTED",
  };
}

export function MerchantDashboardClient({ session }: { session: SessionPayload }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedListing = useMemo(
    () => listings.find((item) => item.id === selectedId) ?? null,
    [listings, selectedId],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setIsLoading(true);
    const res = await fetch("/api/merchant/listings");
    const data = (await res.json()) as { profile?: { listings: Listing[] } | null };
    const next = data.profile?.listings ?? [];
    setListings(next);
    if (next.length > 0) {
      const active = selectedId ? next.find((x) => x.id === selectedId) : next[0];
      if (active) {
        setSelectedId(active.id);
        setForm(mapListingToForm(active));
      }
    } else {
      setSelectedId(null);
      setForm(EMPTY_FORM);
    }
    setIsLoading(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function onCitySelect(city: CitySelection) {
    setForm((prev) => ({
      ...prev,
      city: city.name,
      country: city.country,
      lat: city.lat,
      lng: city.lng,
    }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        ...form,
        socialPlatform: form.socialPlatform || undefined,
        socialHandle: form.socialHandle || undefined,
      };
      const endpoint = selectedListing
        ? `/api/merchant/listings/${selectedListing.id}`
        : "/api/merchant/listings";
      const method = selectedListing ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save listing.");
        setIsSaving(false);
        return;
      }
      setMessage(
        form.status === "DRAFT"
          ? "Draft saved."
          : selectedListing
            ? "Listing resubmitted for review."
            : "Listing submitted for admin review.",
      );
      await refresh();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/join";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Merchant Dashboard</p>
            <h1 className="mt-2 text-2xl font-semibold">Welcome, {session.username}</h1>
            <p className="text-sm text-violet-100/75">
              Create listings, submit for approval, and track verification status.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gold-accent">Your Listings</h2>
            <button
              type="button"
              className="rounded-md bg-gold-accent px-2 py-1 text-xs font-semibold text-black"
              onClick={() => {
                setSelectedId(null);
                setForm(EMPTY_FORM);
                setMessage(null);
                setError(null);
              }}
            >
              New
            </button>
          </div>
          {isLoading ? (
            <p className="text-sm text-violet-100/70">Loading...</p>
          ) : listings.length === 0 ? (
            <p className="text-sm text-violet-100/70">No listings yet.</p>
          ) : (
            <div className="grid gap-2">
              {listings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setForm(mapListingToForm(item));
                  }}
                  className={`rounded-lg border p-3 text-left text-sm ${
                    selectedId === item.id
                      ? "border-gold-accent bg-gold-accent/10"
                      : "border-border bg-surface-muted"
                  }`}
                >
                  <p className="font-semibold">{item.businessName}</p>
                  <p className="mt-1 text-xs text-violet-100/70">Status: {item.status}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">{selectedListing ? "Edit Listing" : "Create Listing"}</h2>
          {selectedListing?.rejectionReason ? (
            <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              Last rejection reason: {selectedListing.rejectionReason}
            </p>
          ) : null}
          <div className="mt-4 grid gap-4">
            <Input label="Merchant Slug (optional)" value={form.merchantId} onChange={(v) => setField("merchantId", v)} />
            <Input label="Business Name" value={form.businessName} onChange={(v) => setField("businessName", v)} />
            <Input label="Business Brief" value={form.businessBrief} onChange={(v) => setField("businessBrief", v)} />
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Category</span>
              <select
                value={form.category}
                onChange={(e) => setField("category", e.target.value as MerchantCategory)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                {MERCHANT_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Merchant Type</span>
              <select
                value={form.isOnline ? "online" : "local"}
                onChange={(e) => setField("isOnline", e.target.value === "online")}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                <option value="local">Local / In-person</option>
                <option value="online">Online / Global</option>
              </select>
            </label>
            {!form.isOnline ? (
              <>
                <label className="grid gap-1 text-sm">
                  <span className="text-violet-100/85">City</span>
                  <CityAutocomplete
                    value={form.city}
                    onChange={(v) => setField("city", v)}
                    onSelect={onCitySelect}
                    placeholder="Start typing city"
                  />
                </label>
                <Input label="Country" value={form.country} onChange={(v) => setField("country", v)} />
                <Input
                  label="Full Address"
                  value={form.fullAddress}
                  onChange={(v) => setField("fullAddress", v)}
                />
              </>
            ) : null}
            <Input label="Website URL" value={form.website} onChange={(v) => setField("website", v)} />
            <Input label="Logo URL" value={form.logoUrl} onChange={(v) => setField("logoUrl", v)} />
            <Input
              label="Hero Image URL"
              value={form.heroImageUrl}
              onChange={(v) => setField("heroImageUrl", v)}
            />
            <Input label="Promo Code" value={form.promoCode} onChange={(v) => setField("promoCode", v)} />
            <Input
              label="Discount Details"
              value={form.discountDetails}
              onChange={(v) => setField("discountDetails", v)}
            />
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Social Platform</span>
              <select
                value={form.socialPlatform}
                onChange={(e) => setField("socialPlatform", e.target.value as SocialPlatform | "")}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                <option value="">None</option>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Social Handle"
              value={form.socialHandle}
              onChange={(v) => setField("socialHandle", v.replace(/^@+/, ""))}
            />
            <label className="grid gap-1 text-sm">
              <span className="text-violet-100/85">Save Mode</span>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value as "DRAFT" | "SUBMITTED")}
                className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                <option value="SUBMITTED">Submit for Review</option>
                <option value="DRAFT">Save as Draft</option>
              </select>
            </label>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSaving}
              className="rounded-xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {isSaving ? "Saving..." : selectedListing ? "Update Listing" : "Create Listing"}
            </button>
          </div>
        </section>
      </div>
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
