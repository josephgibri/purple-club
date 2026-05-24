"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CityAutocomplete, type CitySelection } from "@/components/join/city-autocomplete";
import { ImageUploadField } from "@/components/uploads/image-upload-field";
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
  fsqId: string | null;
  fsqName: string | null;
  fsqAddress: string | null;
  fsqVerifiedAt: string | null;
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
  fsqId: string;
  fsqName: string;
  fsqAddress: string;
  status: "DRAFT" | "SUBMITTED";
};

type FsqMatch = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  category: string;
  website: string;
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
  fsqId: "",
  fsqName: "",
  fsqAddress: "",
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
    fsqId: listing.fsqId ?? "",
    fsqName: listing.fsqName ?? "",
    fsqAddress: listing.fsqAddress ?? "",
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
  const [fsqMatches, setFsqMatches] = useState<FsqMatch[]>([]);
  const [fsqLoading, setFsqLoading] = useState(false);
  const [fsqError, setFsqError] = useState<string | null>(null);

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

  async function lookupFsq() {
    setFsqError(null);
    setFsqLoading(true);
    setFsqMatches([]);
    try {
      const params = new URLSearchParams();
      params.set("q", form.businessName);
      if (form.lat && form.lng) {
        params.set("ll", `${form.lat},${form.lng}`);
      } else if (form.city || form.country) {
        params.set("near", [form.city, form.country].filter(Boolean).join(", "));
      }
      const res = await fetch(`/api/places/search?${params.toString()}`);
      const data = (await res.json()) as { matches?: FsqMatch[]; error?: string };
      if (!res.ok) {
        setFsqError(data.error ?? "Lookup failed.");
      } else {
        setFsqMatches(data.matches ?? []);
        if ((data.matches ?? []).length === 0) {
          setFsqError("No matches. Try a different spelling or set city first.");
        }
      }
    } catch {
      setFsqError("Network error. Try again.");
    } finally {
      setFsqLoading(false);
    }
  }

  function applyFsqMatch(match: FsqMatch) {
    setForm((prev) => ({
      ...prev,
      fsqId: match.id,
      fsqName: match.name,
      fsqAddress: match.address,
      fullAddress: match.address || prev.fullAddress,
      city: match.city || prev.city,
      country: match.country || prev.country,
      lat: match.lat ?? prev.lat,
      lng: match.lng ?? prev.lng,
    }));
    setFsqMatches([]);
    setFsqError(null);
  }

  function clearFsqMatch() {
    setForm((prev) => ({ ...prev, fsqId: "", fsqName: "", fsqAddress: "" }));
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
        fsqId: form.fsqId || undefined,
        fsqName: form.fsqName || undefined,
        fsqAddress: form.fsqAddress || undefined,
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

  const approvedListing = listings.find((l) => l.status === "APPROVED");
  const stickerHref = approvedListing
    ? `/sticker?merchant=${encodeURIComponent(approvedListing.merchantId)}`
    : "/sticker";

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

      <Link
        href={stickerHref}
        className="block rounded-2xl border border-gold-accent/40 bg-gradient-to-br from-[#1a0c39] via-[#140a2d] to-[#0e0722] p-5 transition hover:border-gold-accent"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-accent">
              Window sticker
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {approvedListing
                ? `Print a sticker for ${approvedListing.businessName}`
                : "Get your Purple Club window sticker"}
            </h2>
            <p className="mt-1 text-xs text-violet-100/75">
              Customers scan the QR → install Phantom → buy 1 PBTC → walk back
              in for the discount.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black">
            Open sticker →
          </span>
        </div>
      </Link>

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
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-violet-100/70">
                    <span>Status: {item.status}</span>
                    {item.fsqId ? (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                        FSQ ✓
                      </span>
                    ) : null}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">
            {selectedListing ? "Edit Listing" : "Tell us about your business"}
          </h2>
          {!selectedListing ? (
            <p className="mt-1 text-xs text-violet-100/70">
              Three short steps. We&apos;ll review within 24 hours and email you the result.
            </p>
          ) : null}

          {selectedListing ? <ListingStatusPanel listing={selectedListing} /> : null}

          <div className="mt-4 grid gap-3">
            <FormStep
              defaultOpen={!selectedListing}
              step={1}
              title="Identity"
              subtitle="Who you are and what category you fit."
            >
              <Input label="Business Name" value={form.businessName} onChange={(v) => setField("businessName", v)} />
              <Input label="Business Brief (one short sentence)" value={form.businessBrief} onChange={(v) => setField("businessBrief", v)} />
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
              <Input label="Custom slug (optional)" value={form.merchantId} onChange={(v) => setField("merchantId", v)} />
            </FormStep>

            <FormStep
              defaultOpen={!selectedListing}
              step={2}
              title={form.isOnline ? "Reach" : "Location & verification"}
              subtitle={
                form.isOnline
                  ? "Online merchants serve members worldwide — no address needed."
                  : "Where members can find you, plus a free Foursquare match."
              }
            >
              {form.isOnline ? (
                <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-violet-100/75">
                  You&apos;re listed as <strong>Online / Global</strong>. Skip ahead to step 3.
                </p>
              ) : (
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

                  <div className="rounded-xl border border-border bg-surface-muted p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">
                          Verify business on Foursquare
                        </p>
                        <p className="mt-1 text-xs text-violet-100/70">
                          Optional but recommended. Helps the admin approve faster.
                        </p>
                      </div>
                      {form.fsqId ? (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">
                          ✓ Verified: {form.fsqName}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void lookupFsq()}
                        disabled={fsqLoading || form.businessName.trim().length < 2}
                        className="rounded-xl border border-gold-accent/60 bg-gold-accent/10 px-3 py-2 text-xs font-semibold text-gold-accent disabled:opacity-50"
                      >
                        {fsqLoading ? "Searching..." : "Search Foursquare"}
                      </button>
                      {form.fsqId ? (
                        <button
                          type="button"
                          onClick={clearFsqMatch}
                          className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-violet-100/85"
                        >
                          Clear match
                        </button>
                      ) : null}
                    </div>
                    {fsqError ? <p className="mt-2 text-xs text-rose-300">{fsqError}</p> : null}
                    {fsqMatches.length > 0 ? (
                      <ul className="mt-3 grid gap-2">
                        {fsqMatches.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              onClick={() => applyFsqMatch(match)}
                              className="w-full rounded-lg border border-border bg-surface p-3 text-left text-sm hover:border-gold-accent/60"
                            >
                              <p className="font-semibold">{match.name}</p>
                              <p className="text-xs text-violet-100/70">
                                {match.address || "—"}
                                {match.category ? ` · ${match.category}` : ""}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              )}
            </FormStep>

            <FormStep
              defaultOpen={!selectedListing}
              step={3}
              title="Offer & branding"
              subtitle="What members get and how your listing looks."
            >
              <Input label="Website URL" value={form.website} onChange={(v) => setField("website", v)} />
              <ImageUploadField
                label="Logo"
                value={form.logoUrl}
                onChange={(v) => setField("logoUrl", v)}
                kind="logo"
                aspect="square"
                hint="Square works best. PNG/SVG with transparent background recommended."
              />
              <ImageUploadField
                label="Hero image"
                value={form.heroImageUrl}
                onChange={(v) => setField("heroImageUrl", v)}
                kind="hero"
                aspect="wide"
                hint="Wide cover (16:9) showcasing your storefront, product, or brand."
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
            </FormStep>

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
              {isSaving
                ? "Saving..."
                : selectedListing
                  ? form.status === "DRAFT"
                    ? "Save draft"
                    : "Resubmit for review"
                  : form.status === "DRAFT"
                    ? "Save draft"
                    : "Submit for review"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function FormStep({
  step,
  title,
  subtitle,
  children,
  defaultOpen,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-2xl border border-border bg-surface-muted [&[open]>summary>span.indicator]:rotate-90"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-accent text-xs font-bold text-black">
            {step}
          </span>
          <div>
            <p className="font-semibold text-violet-50">{title}</p>
            <p className="text-xs text-violet-100/65">{subtitle}</p>
          </div>
        </div>
        <span className="indicator inline-block transform text-violet-100/50 transition-transform">
          ▶
        </span>
      </summary>
      <div className="grid gap-3 border-t border-border bg-surface px-4 py-4">{children}</div>
    </details>
  );
}

function ListingStatusPanel({
  listing,
}: {
  listing: { status: string; rejectionReason: string | null; updatedAt: string };
}) {
  const variants: Record<
    string,
    { label: string; tone: string; description: string }
  > = {
    DRAFT: {
      label: "Draft",
      tone: "border-violet-400/40 bg-violet-500/10 text-violet-100",
      description: "Saved but not yet submitted. Switch Save Mode to Submit for Review when you're ready.",
    },
    SUBMITTED: {
      label: "Submitted",
      tone: "border-amber-400/40 bg-amber-500/10 text-amber-100",
      description: "Under review. We'll email you within 24 hours.",
    },
    UNDER_REVIEW: {
      label: "Under review",
      tone: "border-amber-400/40 bg-amber-500/10 text-amber-100",
      description: "An admin is looking at your listing right now.",
    },
    APPROVED: {
      label: "Approved · Live",
      tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
      description: "Your listing is live in the directory. Updates here will require re-review.",
    },
    REJECTED: {
      label: "Changes requested",
      tone: "border-rose-400/40 bg-rose-500/10 text-rose-100",
      description: "Address the reviewer's note below, then resubmit.",
    },
  };
  const v = variants[listing.status] ?? variants.SUBMITTED;
  return (
    <div className={`mt-3 rounded-xl border p-3 text-xs ${v.tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">
        {v.label}
      </p>
      <p className="mt-1 opacity-85">{v.description}</p>
      {listing.rejectionReason ? (
        <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-amber-100">
          <strong>Reviewer note:</strong> {listing.rejectionReason}
        </p>
      ) : null}
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
