"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { AddressAutocomplete, type AddressSelection } from "@/components/join/address-autocomplete";
import { CityAutocomplete, type CitySelection } from "@/components/join/city-autocomplete";
import {
  AnalyticsPanel,
  type ListingAnalytics,
} from "@/components/merchant/analytics-panel";
import { ImageUploadField } from "@/components/uploads/image-upload-field";
import {
  CATEGORY_LABELS,
  MERCHANT_CATEGORIES,
  type MerchantCategory,
  type MerchantType,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/data/merchants";
import type { SessionPayload } from "@/lib/auth";
import { findCountryByCode, findCountryByName, getCountries } from "@/lib/countries";

const LocationMapPicker = dynamic(
  () => import("@/components/join/location-map-picker"),
  { ssr: false },
);

type Listing = {
  id: string;
  merchantId: string;
  businessName: string;
  businessBrief: string;
  category: MerchantCategory;
  isOnline: boolean;
  merchantType?: MerchantType | null;
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
  /**
   * Channel mix. Drives address-fields visibility, promo-code
   * requirements, and the locationOrCoverage label rendered in the
   * directory. `isOnline` is derived from this for back-compat reads
   * against legacy code that still checks the boolean.
   */
  merchantType: MerchantType;
  isOnline: boolean;
  country: string;
  /**
   * ISO-2 country code, kept in sync with `country` so the city
   * autocomplete can scope results to the chosen country. Not
   * persisted server-side — derived from `country` at load time.
   */
  countryCode: string;
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

const COUNTRY_OPTIONS = getCountries();

const EMPTY_FORM: FormState = {
  merchantId: "",
  businessName: "",
  businessBrief: "",
  category: "retail_goods",
  merchantType: "LOCAL",
  isOnline: false,
  country: "",
  countryCode: "",
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
  // Fall back to the legacy isOnline boolean for any pre-hybrid rows
  // whose merchantType column was added after their creation.
  const merchantType: MerchantType =
    listing.merchantType === "ONLINE" ||
    listing.merchantType === "LOCAL" ||
    listing.merchantType === "HYBRID"
      ? listing.merchantType
      : listing.isOnline
        ? "ONLINE"
        : "LOCAL";
  return {
    merchantId: listing.merchantId,
    businessName: listing.businessName,
    businessBrief: listing.businessBrief,
    category: listing.category,
    merchantType,
    isOnline: merchantType === "ONLINE",
    country: listing.country,
    countryCode: findCountryByName(listing.country)?.code ?? "",
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
  const [analytics, setAnalytics] = useState<ListingAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  // Controlled accordion — only one step open at a time so a fresh
  // merchant isn't dumped into 3 simultaneously-open panels. When
  // they're editing an existing listing we open the whole form (step
  // = "all") since they're scanning for what to change rather than
  // walking through it linearly.
  const [openStep, setOpenStep] = useState<1 | 2 | 3 | "all">(1);

  const selectedListing = useMemo(
    () => listings.find((item) => item.id === selectedId) ?? null,
    [listings, selectedId],
  );

  useEffect(() => {
    void refresh();
    void loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/merchant/analytics");
      if (!res.ok) {
        setAnalytics([]);
        return;
      }
      const data = (await res.json()) as { listings?: ListingAnalytics[] };
      setAnalytics(data.listings ?? []);
    } catch {
      setAnalytics([]);
    } finally {
      setAnalyticsLoading(false);
    }
  }

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
        setOpenStep("all");
      }
    } else {
      setSelectedId(null);
      setForm(EMPTY_FORM);
      setOpenStep(1);
    }
    setIsLoading(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function onMerchantTypeChange(next: MerchantType) {
    setForm((prev) => {
      const losingPhysical =
        prev.merchantType !== "ONLINE" && next === "ONLINE";
      return {
        ...prev,
        merchantType: next,
        isOnline: next === "ONLINE",
        // When switching to ONLINE we wipe address-related fields so
        // they don't ghost-save behind a hidden UI. Switching the
        // other way is non-destructive — the merchant fills the address
        // fresh.
        country: losingPhysical ? "" : prev.country,
        countryCode: losingPhysical ? "" : prev.countryCode,
        city: losingPhysical ? "" : prev.city,
        fullAddress: losingPhysical ? "" : prev.fullAddress,
        lat: losingPhysical ? undefined : prev.lat,
        lng: losingPhysical ? undefined : prev.lng,
        fsqId: losingPhysical ? "" : prev.fsqId,
        fsqName: losingPhysical ? "" : prev.fsqName,
        fsqAddress: losingPhysical ? "" : prev.fsqAddress,
      };
    });
  }

  function onCountrySelect(code: string) {
    const country = findCountryByCode(code);
    setForm((prev) => {
      const isSwitchingCountry = code && code !== prev.countryCode && prev.city !== "";
      return {
        ...prev,
        country: country?.name ?? "",
        countryCode: code,
        // Clear the city + coords when the merchant switches country,
        // otherwise we end up with a stale "Paris, FR" address sitting
        // under a new "Country: Germany" selection.
        city: isSwitchingCountry ? "" : prev.city,
        fullAddress: isSwitchingCountry ? "" : prev.fullAddress,
        lat: isSwitchingCountry ? undefined : prev.lat,
        lng: isSwitchingCountry ? undefined : prev.lng,
        fsqId: isSwitchingCountry ? "" : prev.fsqId,
        fsqName: isSwitchingCountry ? "" : prev.fsqName,
        fsqAddress: isSwitchingCountry ? "" : prev.fsqAddress,
      };
    });
  }

  function onCitySelect(city: CitySelection) {
    setForm((prev) => ({
      ...prev,
      city: city.name,
      country: city.country,
      countryCode: city.countryCode,
      lat: city.lat,
      lng: city.lng,
    }));
  }

  function onAddressSelect(selection: AddressSelection) {
    setForm((prev) => {
      const matchedCountry = selection.country
        ? findCountryByName(selection.country)
        : undefined;
      return {
        ...prev,
        fullAddress: selection.address || prev.fullAddress,
        city: selection.city || prev.city,
        country: matchedCountry?.name ?? selection.country ?? prev.country,
        countryCode: matchedCountry?.code ?? prev.countryCode,
        lat: selection.lat ?? prev.lat,
        lng: selection.lng ?? prev.lng,
        fsqId: selection.fsqId,
        fsqName: selection.fsqName,
        fsqAddress: selection.address,
      };
    });
  }

  function onMapMove(lat: number, lng: number) {
    setField("lat", lat);
    setField("lng", lng);
  }

  function clearFsqMatch() {
    setForm((prev) => ({ ...prev, fsqId: "", fsqName: "", fsqAddress: "" }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Coerce empty strings to `undefined` so Zod's `.optional()` actually
      // treats them as absent. Without this, a blank "Custom slug" field
      // ships as "" and fails the `min(2)` rule with the unhelpful
      // "String must contain at least 2 character(s)" message. Same trap
      // for socialHandle/socialPlatform/fsq* — keeping them all in sync.
      const payload = {
        ...form,
        merchantId: form.merchantId || undefined,
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

      {analyticsLoading ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-violet-100/70">
          Loading analytics…
        </div>
      ) : analytics.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-accent">
              Merchant analytics
            </h2>
            <button
              type="button"
              onClick={() => void loadAnalytics()}
              className="rounded-lg border border-border bg-surface-muted px-3 py-1 text-xs text-violet-100/85 hover:border-purple-accent"
            >
              Refresh
            </button>
          </div>
          {analytics.map((entry) => (
            <AnalyticsPanel key={entry.listingId} data={entry} />
          ))}
        </section>
      ) : null}

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
                setOpenStep(1);
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
                    setOpenStep("all");
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
              open={openStep === 1 || openStep === "all"}
              onToggle={(next) =>
                setOpenStep((prev) => (prev === "all" ? "all" : next ? 1 : prev === 1 ? 2 : prev))
              }
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
                  value={form.merchantType}
                  onChange={(event) => onMerchantTypeChange(event.target.value as MerchantType)}
                  className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
                >
                  <option value="LOCAL">Local / In-person</option>
                  <option value="ONLINE">Online / Global</option>
                  <option value="HYBRID">Hybrid — online + in-store</option>
                </select>
                <span className="text-[11px] text-violet-100/55">
                  {form.merchantType === "HYBRID"
                    ? "Members can redeem online (with your promo code) AND walk in (you scan their pass)."
                    : form.merchantType === "ONLINE"
                      ? "Pure web checkout. We hide the address fields."
                      : "Physical storefront only. No promo code needed — you scan the member's pass."}
                </span>
              </label>
              <Input label="Custom slug (optional)" value={form.merchantId} onChange={(v) => setField("merchantId", v)} />
              {openStep !== "all" ? (
                <StepNavButtons onContinue={() => setOpenStep(2)} />
              ) : null}
            </FormStep>

            <FormStep
              open={openStep === 2 || openStep === "all"}
              onToggle={(next) =>
                setOpenStep((prev) => (prev === "all" ? "all" : next ? 2 : prev === 2 ? 3 : prev))
              }
              step={2}
              title={form.merchantType === "ONLINE" ? "Reach" : "Location & verification"}
              subtitle={
                form.merchantType === "ONLINE"
                  ? "Online merchants serve members worldwide — no address needed."
                  : form.merchantType === "HYBRID"
                    ? "Your physical storefront — members can also redeem online."
                    : "Where members can find you, plus a free Foursquare match."
              }
            >
              {form.merchantType === "ONLINE" ? (
                <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-violet-100/75">
                  You&apos;re listed as <strong>Online / Global</strong>. Skip ahead to step 3.
                </p>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    <span className="text-violet-100/85">Country</span>
                    <select
                      value={form.countryCode}
                      onChange={(event) => onCountrySelect(event.target.value)}
                      className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
                    >
                      <option value="">Select country…</option>
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-violet-100/85">City</span>
                    <CityAutocomplete
                      value={form.city}
                      onChange={(v) => setField("city", v)}
                      onSelect={onCitySelect}
                      placeholder={
                        form.countryCode
                          ? `Start typing a city in ${form.country}`
                          : "Pick a country first"
                      }
                      disabled={!form.countryCode}
                      countryCode={form.countryCode || undefined}
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-violet-100/85">Shop name or full address</span>
                      {form.fsqId ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-semibold text-emerald-200">
                          ✓ Verified: {form.fsqName}
                          <button
                            type="button"
                            onClick={clearFsqMatch}
                            className="text-emerald-200/80 hover:text-white"
                            aria-label="Clear Foursquare match"
                          >
                            ×
                          </button>
                        </span>
                      ) : null}
                    </div>
                    <AddressAutocomplete
                      value={form.fullAddress}
                      onChange={(v) => setField("fullAddress", v)}
                      onSelect={onAddressSelect}
                      near={
                        form.city && form.country
                          ? `${form.city}, ${form.country}`
                          : form.city || form.country || undefined
                      }
                      ll={
                        typeof form.lat === "number" && typeof form.lng === "number"
                          ? `${form.lat},${form.lng}`
                          : undefined
                      }
                      disabled={!form.countryCode}
                    />
                    <span className="text-[11px] text-violet-100/55">
                      Pick a suggestion to autofill the address, pin, and Foursquare
                      verification badge — or type freeform.
                    </span>
                  </label>

                  {typeof form.lat === "number" && typeof form.lng === "number" ? (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-xs text-violet-100/75">
                        <span>
                          Drag the pin (or click the map) to fine-tune the exact storefront
                          location.
                        </span>
                        <span className="font-mono text-[11px] text-violet-100/55">
                          {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                        </span>
                      </div>
                      <LocationMapPicker
                        lat={form.lat}
                        lng={form.lng}
                        onMove={onMapMove}
                      />
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-violet-100/70">
                      Map preview appears once you pick a city or an address suggestion.
                    </p>
                  )}
                </>
              )}
              {openStep !== "all" ? (
                <StepNavButtons
                  onBack={() => setOpenStep(1)}
                  onContinue={() => setOpenStep(3)}
                />
              ) : null}
            </FormStep>

            <FormStep
              open={openStep === 3 || openStep === "all"}
              onToggle={(next) =>
                setOpenStep((prev) => (prev === "all" ? "all" : next ? 3 : prev))
              }
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
              {form.merchantType === "ONLINE" ? (
                <Input
                  label="Promo Code *"
                  value={form.promoCode}
                  onChange={(v) => setField("promoCode", v)}
                  hint="Required for online merchants — members paste this at your checkout."
                />
              ) : form.merchantType === "HYBRID" ? (
                <Input
                  label="Promo Code *"
                  value={form.promoCode}
                  onChange={(v) => setField("promoCode", v)}
                  hint="Required for the online side. In-store members can also redeem by showing their pass — no code needed."
                />
              ) : (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100/90">
                  <p className="font-semibold text-emerald-100">No promo code needed</p>
                  <p className="mt-1 text-emerald-100/80">
                    Members show their live{" "}
                    <Link href="/pass" className="underline underline-offset-2 hover:text-white">
                      Purple Club pass
                    </Link>{" "}
                    at the counter — your staff applies the discount.
                  </p>
                </div>
              )}
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
  open,
  onToggle,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <details
      open={open}
      onToggle={(event) => {
        const target = event.currentTarget;
        if (target.open !== open) onToggle(target.open);
      }}
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-violet-100/85">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
      />
      {hint ? <span className="text-[11px] text-violet-100/60">{hint}</span> : null}
    </label>
  );
}

/**
 * Step-pagination footer rendered inside `FormStep` while the accordion
 * is in step-by-step mode (i.e. a brand-new merchant filling out the
 * form for the first time). Hidden once the user picks an existing
 * listing — at that point we open all panels so they can scan the
 * whole form at once.
 */
function StepNavButtons({
  onBack,
  onContinue,
}: {
  onBack?: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/85 hover:border-purple-accent"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onContinue}
        className="rounded-xl bg-gold-accent/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black hover:bg-gold-accent"
      >
        Continue →
      </button>
    </div>
  );
}
