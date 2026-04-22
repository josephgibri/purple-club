"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { CircleHelp } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { CityAutocomplete, type CitySelection } from "@/components/join/city-autocomplete";
import {
  MERCHANT_CATEGORIES,
  type MerchantCategory,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  merchants,
} from "@/data/merchants";
import { toSlug, WEBSITE_REGEX } from "@/lib/merchantSchema";

export type MerchantFormMode = "submit" | "update";

export type MerchantFormInitial = {
  merchantId?: string;
  businessName?: string;
  businessBrief?: string;
  category?: MerchantCategory;
  isOnline?: boolean;
  country?: string;
  city?: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
  website?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  promoCode?: string;
  discountDetails?: string;
  socialPlatform?: SocialPlatform;
  socialHandle?: string;
  email?: string;
};

export type MerchantFormResult = {
  issueUrl: string;
  editToken: string;
  editUrl: string;
  merchantId: string;
};

type MerchantFormProps = {
  mode: MerchantFormMode;
  initial?: MerchantFormInitial;
  onSuccess: (result: MerchantFormResult) => void;
  showRemoveAction?: boolean;
  onRemove?: () => void;
  submitLabel?: string;
};

type FormState = {
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
  email: string;
};

const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  retail_goods: "Retail & Goods",
  dining_nightlife: "Dining & Nightlife",
  tech_digital: "Tech & Digital",
  travel_leisure: "Travel & Leisure",
  wellness_beauty: "Wellness & Beauty",
  professional_services: "Professional Services",
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  x: "X (Twitter)",
  tiktok: "TikTok",
};

const DEFAULT_HERO_BY_CATEGORY: Record<MerchantCategory, string> = {
  retail_goods: "/templates/retail-template.svg",
  dining_nightlife: "/templates/dining-template.svg",
  tech_digital: "/templates/tech-template.svg",
  travel_leisure: "/templates/travel-template.svg",
  wellness_beauty: "/templates/wellness-template.svg",
  professional_services: "/templates/professional-template.svg",
};

const BRIEF_MAX = 140;

function initialState(initial?: MerchantFormInitial): FormState {
  return {
    businessName: initial?.businessName ?? "",
    businessBrief: initial?.businessBrief ?? "",
    category: initial?.category ?? "retail_goods",
    isOnline: initial?.isOnline ?? false,
    country: initial?.country ?? "",
    city: initial?.city ?? "",
    fullAddress: initial?.fullAddress ?? "",
    lat: initial?.lat,
    lng: initial?.lng,
    website: initial?.website ?? "",
    logoUrl: initial?.logoUrl ?? "",
    heroImageUrl: initial?.heroImageUrl ?? "",
    promoCode: initial?.promoCode ?? "",
    discountDetails: initial?.discountDetails ?? "",
    socialPlatform: initial?.socialPlatform ?? "",
    socialHandle: initial?.socialHandle ?? "",
    email: initial?.email ?? "",
  };
}

function briefCounterClass(len: number): string {
  if (len >= BRIEF_MAX) return "text-rose-300";
  if (len >= BRIEF_MAX - 20) return "text-amber-300";
  return "text-violet-100/60";
}

export function MerchantForm(props: MerchantFormProps) {
  const {
    mode,
    initial,
    onSuccess,
    showRemoveAction,
    onRemove,
    submitLabel,
  } = props;

  const [form, setForm] = useState<FormState>(() => initialState(initial));
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [refineState, setRefineState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const refineTimestampRef = useRef<number>(0);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
  }

  function setCitySelection(selection: CitySelection) {
    setForm((prev) => ({
      ...prev,
      country: selection.country,
      city: selection.name,
      lat: selection.lat,
      lng: selection.lng,
    }));
  }

  const previewSlug = useMemo(() => {
    if (mode === "update" && initial?.merchantId) return initial.merchantId;
    return toSlug(form.businessName) || "new-merchant";
  }, [mode, initial?.merchantId, form.businessName]);

  const slugCollides = useMemo(() => {
    if (mode === "update") return false;
    return merchants.some((m) => m.id === previewSlug);
  }, [mode, previewSlug]);

  async function refinePin() {
    if (!form.fullAddress) {
      setFieldError({ field: "fullAddress", message: "Enter a full address first" });
      return;
    }
    const now = Date.now();
    const guardKey = "pc-nominatim-last";
    let lastCall = 0;
    try {
      const stored = sessionStorage.getItem(guardKey);
      lastCall = stored ? Number(stored) : 0;
    } catch {
      lastCall = refineTimestampRef.current;
    }
    if (now - lastCall < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - (now - lastCall)));
    }
    setRefineState("loading");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      const query = [form.fullAddress, form.city, form.country].filter(Boolean).join(", ");
      url.searchParams.set("q", query);
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      const stamp = Date.now();
      try {
        sessionStorage.setItem(guardKey, String(stamp));
      } catch {
        refineTimestampRef.current = stamp;
      }
      if (!res.ok) {
        setRefineState("fail");
        return;
      }
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      const first = data[0];
      if (!first) {
        setRefineState("fail");
        return;
      }
      const lat = Number.parseFloat(first.lat);
      const lng = Number.parseFloat(first.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setRefineState("fail");
        return;
      }
      setForm((prev) => ({ ...prev, lat, lng }));
      setRefineState("ok");
    } catch {
      setRefineState("fail");
    }
  }

  function firstValidationIssue(): { field: string; message: string } | null {
    if (form.businessName.trim().length < 2)
      return { field: "businessName", message: "Business name is required" };
    if (form.businessBrief.trim().length < 10)
      return { field: "businessBrief", message: "Business brief must be at least 10 characters" };
    if (form.businessBrief.length > BRIEF_MAX)
      return { field: "businessBrief", message: `Brief exceeds ${BRIEF_MAX} characters` };
    if (!WEBSITE_REGEX.test(form.website))
      return { field: "website", message: "Website must start with http:// or https://" };
    if (!WEBSITE_REGEX.test(form.logoUrl))
      return { field: "logoUrl", message: "Logo URL must start with http:// or https://" };
    if (!WEBSITE_REGEX.test(form.heroImageUrl))
      return { field: "heroImageUrl", message: "Hero image URL must start with http:// or https://" };
    if (form.discountDetails.trim().length < 4)
      return { field: "discountDetails", message: "Describe the discount" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      return { field: "email", message: "Enter a valid contact email" };
    if (form.isOnline) {
      if (!form.promoCode.trim())
        return { field: "promoCode", message: "Online merchants must provide a promo code" };
    } else {
      if (!form.country) return { field: "country", message: "Country is required" };
      if (!form.city) return { field: "city", message: "City is required" };
      if (!form.fullAddress)
        return { field: "fullAddress", message: "Full address is required" };
    }
    if (form.socialHandle && !form.socialPlatform)
      return { field: "socialPlatform", message: "Pick a platform for the handle" };
    if (mode === "submit" && slugCollides) {
      return {
        field: "businessName",
        message: `"${previewSlug}" is already taken — add a modifier (e.g. city or neighborhood).`,
      };
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setSlugSuggestions([]);
    const issue = firstValidationIssue();
    if (issue) {
      setFieldError({ field: issue.field, message: issue.message });
      if (issue.field === "businessName" && slugCollides) {
        const cityPart = form.city ? toSlug(form.city) : "";
        const suggestions = [
          cityPart ? `${previewSlug}-${cityPart}` : null,
          `${previewSlug}-${new Date().getFullYear()}`,
          `${previewSlug}-official`,
        ].filter((s): s is string => Boolean(s) && !merchants.some((m) => m.id === s));
        setSlugSuggestions(suggestions);
      }
      return;
    }
    if (!siteKey) {
      setFieldError({ message: "Turnstile site key missing. Contact Purple Club." });
      return;
    }
    if (!turnstileToken) {
      setFieldError({ message: "Complete the captcha to continue" });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        type: mode,
        merchantId: mode === "update" ? initial?.merchantId : undefined,
        businessName: form.businessName,
        businessBrief: form.businessBrief,
        category: form.category,
        isOnline: form.isOnline,
        country: form.country,
        city: form.city,
        fullAddress: form.fullAddress,
        lat: form.lat,
        lng: form.lng,
        website: form.website,
        logoUrl: form.logoUrl,
        heroImageUrl: form.heroImageUrl,
        promoCode: form.promoCode,
        discountDetails: form.discountDetails,
        socialPlatform: form.socialPlatform || undefined,
        socialHandle: form.socialHandle ? form.socialHandle.replace(/^@+/, "") : undefined,
        email: form.email,
        turnstileToken,
      };
      const res = await fetch("/api/submit-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | MerchantFormResult
        | { error: string; field?: string };
      if (!res.ok || !("issueUrl" in data)) {
        const err = data as { error: string; field?: string };
        setFieldError({ field: err.field, message: err.error || "Submission failed" });
        setIsSubmitting(false);
        return;
      }
      onSuccess(data);
    } catch {
      setFieldError({ message: "Network error — please retry" });
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      {/* Identity card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-gold-accent">Identity</h3>
        <div className="mt-4 grid gap-4">
          <Field
            label="Business Name"
            error={fieldError?.field === "businessName" ? fieldError.message : undefined}
          >
            <input
              value={form.businessName}
              onChange={(e) => setField("businessName", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="Purple Wellness Studio"
              disabled={mode === "update"}
            />
            {mode === "submit" ? (
              <p className="text-xs text-violet-100/70">
                Slug preview: <span className="font-mono text-violet-100/90">{previewSlug}</span>
                {slugCollides ? (
                  <span className="ml-2 text-rose-300">(already taken)</span>
                ) : null}
              </p>
            ) : null}
            {slugSuggestions.length > 0 ? (
              <div className="mt-2 rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                <p className="font-medium">Try one of these:</p>
                <ul className="mt-1 list-inside list-disc">
                  {slugSuggestions.map((s) => (
                    <li key={s} className="font-mono">{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Field>
          <Field
            label="Business Brief"
            error={fieldError?.field === "businessBrief" ? fieldError.message : undefined}
          >
            <textarea
              maxLength={BRIEF_MAX}
              value={form.businessBrief}
              onChange={(e) => setField("businessBrief", e.target.value)}
              className="min-h-24 w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="One sentence that hooks a PBTC holder."
            />
            <p className={`mt-1 text-xs ${briefCounterClass(form.businessBrief.length)}`}>
              {form.businessBrief.length} / {BRIEF_MAX}
            </p>
          </Field>
          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => setField("category", e.target.value as MerchantCategory)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
            >
              {MERCHANT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Contact Email"
            error={fieldError?.field === "email" ? fieldError.message : undefined}
          >
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="owner@example.com"
              disabled={mode === "update"}
            />
            <p className="text-xs text-violet-100/70">
              Used only to identify you in the manual recovery flow.
            </p>
          </Field>
          <div className="grid gap-2 text-sm md:grid-cols-[1fr_auto] md:items-end">
            <Field
              label="Social Platform"
              error={fieldError?.field === "socialPlatform" ? fieldError.message : undefined}
            >
              <div className="flex flex-wrap gap-2">
                {SOCIAL_PLATFORMS.map((p) => {
                  const selected = form.socialPlatform === p;
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setField("socialPlatform", selected ? "" : p)}
                      aria-pressed={selected}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                        selected
                          ? "border-gold-accent bg-gold-accent/15 text-gold-accent"
                          : "border-border bg-surface-muted text-violet-100/80"
                      }`}
                    >
                      {SOCIAL_LABELS[p]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Handle (no @)">
              <input
                value={form.socialHandle}
                onChange={(e) =>
                  setField("socialHandle", e.target.value.replace(/^@+/, ""))
                }
                className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
                placeholder="purpleclubhq"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Location card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-gold-accent">Location</h3>
        <div className="mt-4 grid gap-4">
          <Field label="Merchant Type">
            <select
              value={form.isOnline ? "online" : "local"}
              onChange={(e) => setField("isOnline", e.target.value === "online")}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
            >
              <option value="local">Local / In-Person</option>
              <option value="online">Global / Online</option>
            </select>
          </Field>
          {!form.isOnline ? (
            <>
              <Field
                label="City"
                error={
                  fieldError?.field === "city" || fieldError?.field === "country"
                    ? fieldError.message
                    : undefined
                }
              >
                <CityAutocomplete
                  value={form.city}
                  onChange={(v) => setField("city", v)}
                  onSelect={setCitySelection}
                  placeholder="Start typing a city (e.g. Miami)"
                />
                {form.country ? (
                  <p className="mt-1 text-xs text-violet-100/70">
                    Country: <span className="text-violet-100/90">{form.country}</span>
                    {form.lat != null && form.lng != null ? (
                      <>
                        <span className="mx-1">·</span>
                        <span className="font-mono text-xs">
                          {form.lat.toFixed(3)}, {form.lng.toFixed(3)}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </Field>
              <Field
                label="Full Address"
                error={fieldError?.field === "fullAddress" ? fieldError.message : undefined}
              >
                <div className="flex flex-wrap items-stretch gap-2">
                  <input
                    value={form.fullAddress}
                    onChange={(e) => setField("fullAddress", e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
                    placeholder="1440 Alton Rd, Miami Beach, FL 33139"
                  />
                  <button
                    type="button"
                    onClick={() => void refinePin()}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-violet-100/90 hover:border-purple-accent disabled:opacity-50"
                    disabled={refineState === "loading"}
                  >
                    {refineState === "loading" ? "Refining…" : "Refine pin"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-violet-100/70">
                  {refineState === "ok"
                    ? "Pin refined from address."
                    : refineState === "fail"
                      ? "Could not refine — keeping city-center coords."
                      : "Optional: snap the map pin to your exact address."}
                </p>
              </Field>
            </>
          ) : (
            <p className="rounded-xl border border-border bg-surface-muted p-4 text-xs text-violet-100/70">
              Online merchants cover a global audience — no physical address required.
            </p>
          )}
        </div>
      </div>

      {/* Media & Offer card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-gold-accent">Media & Offer</h3>
        <div className="mt-4 grid gap-4">
          <Field
            label="Website"
            error={fieldError?.field === "website" ? fieldError.message : undefined}
          >
            <input
              value={form.website}
              onChange={(e) => setField("website", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="https://example.com"
            />
          </Field>
          <Field
            label="Logo URL"
            error={fieldError?.field === "logoUrl" ? fieldError.message : undefined}
          >
            <input
              value={form.logoUrl}
              onChange={(e) => setField("logoUrl", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="https://images.example.com/logo.png"
            />
            <ImageUrlTooltip />
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logoUrl}
                alt="Logo preview"
                className="mt-2 h-20 w-20 rounded-lg border border-border object-cover"
              />
            ) : (
              <p className="mt-2 text-xs text-violet-100/60">
                Paste a logo URL to see a live preview.
              </p>
            )}
          </Field>
          <Field
            label="Hero Image URL"
            error={fieldError?.field === "heroImageUrl" ? fieldError.message : undefined}
          >
            <input
              value={form.heroImageUrl}
              onChange={(e) => setField("heroImageUrl", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="https://images.example.com/hero.png"
            />
            <ImageUrlTooltip />
            {form.heroImageUrl ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.heroImageUrl}
                  alt="Hero preview"
                  className="h-36 w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      DEFAULT_HERO_BY_CATEGORY[form.category];
                  }}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-violet-100/60">
                If you skip this, a premium template image will be used in directory cards.
              </p>
            )}
          </Field>
          <Field
            label={form.isOnline ? "Promo Code (required for online merchants)" : "Promo Code (optional)"}
            error={fieldError?.field === "promoCode" ? fieldError.message : undefined}
          >
            <input
              value={form.promoCode}
              onChange={(e) => setField("promoCode", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="PURPLE25"
            />
          </Field>
          <Field
            label="Discount Details"
            error={fieldError?.field === "discountDetails" ? fieldError.message : undefined}
          >
            <textarea
              value={form.discountDetails}
              onChange={(e) => setField("discountDetails", e.target.value)}
              className="min-h-24 w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent"
              placeholder="20% off for PBTC holders with an active pass."
            />
          </Field>
        </div>
      </div>

      {siteKey ? (
        <div className="flex justify-start">
          <Turnstile
            siteKey={siteKey}
            onSuccess={(token) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
            options={{ theme: "dark" }}
          />
        </div>
      ) : (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
          Turnstile site key missing. Submission is disabled until this is configured.
        </p>
      )}

      {fieldError && !fieldError.field ? (
        <p className="text-sm text-rose-300">{fieldError.message}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-gold-accent px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isSubmitting
            ? "Submitting…"
            : (submitLabel ??
              (mode === "submit" ? "Submit to Purple Club" : "Submit update"))}
        </button>
        {showRemoveAction && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
          >
            Request removal
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field(props: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-violet-100/90">{props.label}</span>
      {props.children}
      {props.error ? <span className="text-xs text-rose-300">{props.error}</span> : null}
    </label>
  );
}

function ImageUrlTooltip() {
  return (
    <details className="mt-2 text-xs text-violet-100/70">
      <summary className="inline-flex cursor-pointer items-center gap-1">
        <CircleHelp size={14} />
        How do I get a URL?
      </summary>
      <p className="mt-2">
        Right-click an image on Instagram, Google Maps, or a website and choose
        Copy image address — paste the result here.
      </p>
    </details>
  );
}
