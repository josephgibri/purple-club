"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { merchants as bundledMerchants, type Merchant, type MerchantCategory } from "@/data/merchants";

const DEFAULT_HERO_BY_CATEGORY: Record<MerchantCategory, string> = {
  retail_goods: "/templates/retail-template.svg",
  dining_nightlife: "/templates/dining-template.svg",
  tech_digital: "/templates/tech-template.svg",
  travel_leisure: "/templates/travel-template.svg",
  wellness_beauty: "/templates/wellness-template.svg",
  professional_services: "/templates/professional-template.svg",
};

/**
 * Public-facing teaser strip. Renders 3 anchor merchants by name + logo +
 * category only — no addresses, no promo codes, no CTAs. The full
 * directory (with redeemable codes, coordinates, drawer detail) lives
 * behind `/directory` and the membership gate.
 *
 * This intentionally still hits `/api/public/merchants` so the strip
 * stays fresh when the DB has approved listings, but the data we surface
 * publicly is a hard subset.
 */

type AnchorTeaserProps = {
  limit?: number;
};

export function AnchorTeaser({ limit = 3 }: AnchorTeaserProps) {
  const [merchantList, setMerchantList] = useState<Merchant[]>(bundledMerchants);
  const [errored, setErrored] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/public/merchants");
        if (!res.ok) return;
        const data = (await res.json()) as { merchants?: Merchant[] };
        if (!cancelled && data.merchants && data.merchants.length > 0) {
          setMerchantList(data.merchants);
        }
      } catch {
        // Bundled list already in state.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const anchors = merchantList
    .filter((m) => m.isAnchor)
    .concat(merchantList.filter((m) => !m.isAnchor))
    .slice(0, limit);

  if (anchors.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {anchors.map((merchant) => (
        <div
          key={merchant.id}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:border-gold-accent/50"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-surface">
              <Image
                src={
                  errored[merchant.id]
                    ? DEFAULT_HERO_BY_CATEGORY[merchant.category]
                    : merchant.logoUrl
                }
                alt={`${merchant.name} logo`}
                fill
                sizes="48px"
                className="object-cover"
                onError={() =>
                  setErrored((prev) => ({ ...prev, [merchant.id]: true }))
                }
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{merchant.name}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-violet-100/55">
                {merchant.isOnline ? "Global / Online" : merchant.city || "Local hub"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
