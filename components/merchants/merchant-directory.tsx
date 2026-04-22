"use client";

import clsx from "clsx";
import Image from "next/image";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { MerchantDetailDrawer } from "@/components/merchants/merchant-detail-drawer";
import {
  MERCHANT_CATEGORIES,
  type Merchant,
  type MerchantCategory,
} from "@/data/merchants";

const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  retail_goods: "Retail & Goods",
  dining_nightlife: "Dining & Nightlife",
  tech_digital: "Tech & Digital",
  travel_leisure: "Travel & Leisure",
  wellness_beauty: "Wellness & Beauty",
  professional_services: "Professional Services",
};

const DEFAULT_HERO_BY_CATEGORY: Record<MerchantCategory, string> = {
  retail_goods: "/templates/retail-template.svg",
  dining_nightlife: "/templates/dining-template.svg",
  tech_digital: "/templates/tech-template.svg",
  travel_leisure: "/templates/travel-template.svg",
  wellness_beauty: "/templates/wellness-template.svg",
  professional_services: "/templates/professional-template.svg",
};

type ImgErrState = {
  hero: Record<string, boolean>;
  logo: Record<string, boolean>;
};

type MerchantDirectoryProps = {
  merchants: Merchant[];
  locked?: boolean;
};

export function MerchantDirectory({ merchants, locked = false }: MerchantDirectoryProps) {
  const [activeCategory, setActiveCategory] = useState<MerchantCategory | "all">("all");
  const [activeLocation, setActiveLocation] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [imgErr, setImgErr] = useState<ImgErrState>({ hero: {}, logo: {} });

  function markHeroError(id: string) {
    setImgErr((prev) => ({ ...prev, hero: { ...prev.hero, [id]: true } }));
  }
  function markLogoError(id: string) {
    setImgErr((prev) => ({ ...prev, logo: { ...prev.logo, [id]: true } }));
  }
  function heroSrc(merchant: Merchant): string {
    return imgErr.hero[merchant.id]
      ? DEFAULT_HERO_BY_CATEGORY[merchant.category]
      : merchant.heroImageUrl;
  }
  function logoSrc(merchant: Merchant): string {
    return imgErr.logo[merchant.id]
      ? DEFAULT_HERO_BY_CATEGORY[merchant.category]
      : merchant.logoUrl;
  }
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedMerchantId = searchParams.get("merchant");
  const selectedMerchant =
    merchants.find((item) => item.id === selectedMerchantId) ?? null;

  const locationOptions = useMemo(() => {
    const citySet = new Set(
      merchants
        .filter((item) => !item.isOnline && item.city)
        .map((item) => item.city),
    );
    return ["all", "global-online", ...Array.from(citySet).sort()];
  }, [merchants]);

  const filtered = useMemo(() => {
    const matches = merchants.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (
        activeLocation !== "all" &&
        !(
          (activeLocation === "global-online" && item.isOnline) ||
          item.city === activeLocation
        )
      ) {
        return false;
      }
      if (
        searchQuery.trim() &&
        !item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    // Prioritize anchors only within the current filtered result set.
    return [...matches].sort((a, b) => Number(b.isAnchor) - Number(a.isAnchor));
  }, [activeCategory, activeLocation, merchants, searchQuery]);

  const anchorMerchants = useMemo(
    () => filtered.filter((item) => item.isAnchor),
    [filtered],
  );
  const standardMerchants = useMemo(
    () => filtered.filter((item) => !item.isAnchor),
    [filtered],
  );

  function openMerchant(merchant: Merchant) {
    if (locked) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("merchant", merchant.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeMerchant() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("merchant");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function copyInvitation() {
    const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join` : "/join";
    const text = `Hey! I'm a member of the Purple Club. I'd love to see your business as a featured partner for our PBTC community. You can join the network here: ${joinUrl}`;
    await navigator.clipboard.writeText(text);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1800);
  }

  const hasResults = filtered.length > 0;
  const emptyScope =
    activeLocation === "global-online"
      ? "Global/Online"
      : activeLocation === "all"
        ? "this area"
        : activeLocation;

  return (
    <section className="mt-10 space-y-8">
      <div className="space-y-4">
        <div className="group relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-100/40 transition group-focus-within:text-gold-accent"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search merchants..."
            className="w-full rounded-full border border-white/[0.06] bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-violet-50 outline-none backdrop-blur-sm transition placeholder:text-violet-100/35 focus:border-gold-accent/40 focus:bg-white/[0.05]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton
            label="All"
            active={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          />
          {MERCHANT_CATEGORIES.map((category) => (
            <FilterButton
              key={category}
              label={CATEGORY_LABELS[category]}
              active={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            />
          ))}
          <select
            value={activeLocation}
            onChange={(event) => setActiveLocation(event.target.value)}
            className="rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-violet-100 outline-none backdrop-blur-sm transition hover:border-white/15"
          >
            {locationOptions.map((location) => (
              <option key={location} value={location} className="bg-surface">
                {location === "all"
                  ? "All Locations"
                  : location === "global-online"
                    ? "Global/Online"
                    : location}
              </option>
            ))}
          </select>
        </div>
      </div>

      {anchorMerchants.length > 0 ? (
        <div className={clsx("space-y-4", locked && "relative")}>
          {anchorMerchants.map((merchant, index) => (
            <button
              type="button"
              key={merchant.id}
              onClick={() => openMerchant(merchant)}
              className={clsx(
                "group relative block w-full overflow-hidden rounded-3xl border border-gold-accent/60 text-left shadow-[0_0_40px_-15px_rgba(246,196,83,0.35)] transition hover:border-gold-accent hover:shadow-[0_0_50px_-10px_rgba(246,196,83,0.55)]",
                locked && "blur-[2px]",
              )}
            >
              <div className="relative min-h-72 w-full sm:min-h-80">
                <Image
                  src={heroSrc(merchant)}
                  alt={merchant.name}
                  fill
                  sizes="100vw"
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                  onError={() => markHeroError(merchant.id)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
                <div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-gold-accent/60 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-accent backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-accent" />
                  Featured Anchor
                </div>
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="max-w-3xl">
                      <h3 className="text-2xl font-semibold text-white sm:text-3xl">{merchant.name}</h3>
                      <p className="mt-2 text-sm text-violet-100/90 sm:text-base">{merchant.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="text-sm font-semibold text-gold-accent">{merchant.discount}</p>
                        {merchant.isOnline ? (
                          <span className="inline-flex rounded-full border border-gold-accent/80 bg-black/30 px-2.5 py-1 text-[11px] font-medium text-gold-accent">
                            Global/Online
                          </span>
                        ) : (
                          <p className="text-xs text-violet-100/80">{merchant.locationOrCoverage}</p>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-xl bg-gold-accent px-5 py-2.5 text-sm font-semibold text-black transition group-hover:brightness-110">
                      View Merchant
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className={clsx("grid gap-4 sm:grid-cols-2", locked && "relative")}>
        {hasResults ? (
          standardMerchants.map((merchant, index) => (
            <button
              type="button"
              key={merchant.id}
              onClick={() => openMerchant(merchant)}
              className={clsx(
                "group overflow-hidden rounded-2xl border border-border text-left transition hover:scale-[1.01] hover:border-purple-accent",
                locked && "blur-[2px]",
              )}
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={heroSrc(merchant)}
                  alt={merchant.name}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  priority={index === 0 && anchorMerchants.length === 0}
                  loading={index === 0 && anchorMerchants.length === 0 ? "eager" : "lazy"}
                  className="object-cover transition duration-500 group-hover:scale-[1.04]"
                  onError={() => markHeroError(merchant.id)}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {merchant.isOnline ? (
                  <span className="absolute right-3 top-3 inline-flex rounded-full border border-gold-accent/70 bg-black/45 px-2 py-1 text-[10px] font-medium text-gold-accent backdrop-blur-md">
                    Global/Online
                  </span>
                ) : null}
              </div>
              <div className="relative border-t border-white/10 bg-white/5 p-5 backdrop-blur-md">
                <div className="absolute -top-6 left-5 h-12 w-12 overflow-hidden rounded-xl border border-white/15 bg-surface shadow-lg">
                  <Image
                    src={logoSrc(merchant)}
                    alt={`${merchant.name} logo`}
                    fill
                    sizes="48px"
                    className="object-cover"
                    onError={() => markLogoError(merchant.id)}
                  />
                </div>
                <div className="mt-7">
                  <h3 className="text-lg font-semibold">{merchant.name}</h3>
                </div>
                <p className="mt-1 text-sm text-violet-100/75">{merchant.description}</p>
                <p className="mt-4 text-sm text-gold-accent">{merchant.discount}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  {merchant.isOnline ? (
                    <span className="text-xs text-violet-100/55">Worldwide</span>
                  ) : (
                    <p className="text-xs text-violet-100/65">{merchant.locationOrCoverage}</p>
                  )}
                  <span className="inline-flex rounded-lg bg-gold-accent px-3 py-1.5 text-xs font-semibold text-black">
                    View
                  </span>
                </div>
              </div>
            </button>
          ))
        ) : (
          <article className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-xl sm:col-span-2">
            <h3 className="text-xl font-semibold text-gold-accent">
              Purple Club is currently growing in {emptyScope}.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-violet-100/80">
              Use your status to invite the first local partner and help expand
              the PBTC merchant network on Solana.
            </p>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="mt-4 rounded-xl bg-[#EAB308] px-4 py-2 text-sm font-semibold text-black"
            >
              Send Invitation
            </button>
          </article>
        )}

        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="ambassador-texture group relative overflow-hidden rounded-2xl border border-gold-accent/50 p-6 text-left transition hover:border-gold-accent hover:shadow-[0_0_40px_-15px_rgba(246,196,83,0.5)] sm:col-span-2"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold-accent/5 via-transparent to-purple-accent/10" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-accent">Ambassador Mode</p>
            <h3 className="mt-2 text-2xl font-semibold">Invite a Merchant</h3>
            <p className="mt-2 max-w-2xl text-sm text-violet-100/80">
              Know a business that belongs in Purple Club? Invite them to the
              network and expand holder utility.
            </p>
            <span className="mt-4 inline-flex rounded-lg bg-gold-accent px-4 py-2 text-sm font-semibold text-black transition group-hover:brightness-110">
              Open Invite
            </span>
          </div>
        </button>

        {locked ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 p-6 text-center">
            <p className="max-w-xs text-sm font-medium text-violet-50">
              Connect a wallet with at least 1 PBTC to unlock merchant details.
            </p>
          </div>
        ) : null}
      </div>
      <MerchantDetailDrawer
        key={selectedMerchant?.id ?? "drawer-empty"}
        merchant={selectedMerchant}
        isOpen={Boolean(selectedMerchant)}
        onClose={closeMerchant}
      />
      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gold-accent/60 bg-surface p-6 backdrop-blur-xl">
            <h3 className="text-xl font-semibold">Invite a Merchant</h3>
            <p className="mt-2 text-sm text-violet-100/80">
              Know a business that belongs in Purple Club? Invite them to the
              network.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyInvitation()}
                className="rounded-xl bg-[#EAB308] px-4 py-2 text-sm font-semibold text-black"
              >
                {inviteCopied ? "Copied!" : "Copy Invitation"}
              </button>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type FilterButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function FilterButton({ label, active, onClick }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-gold-accent bg-gold-accent text-black"
          : "border-border bg-surface-muted text-violet-100 hover:border-purple-accent",
      )}
    >
      {label}
    </button>
  );
}
