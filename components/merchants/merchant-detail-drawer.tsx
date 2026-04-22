"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { Copy, ExternalLink, MapPin, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Merchant, MerchantCategory } from "@/data/merchants";

const MerchantLocationMap = dynamic(
  () => import("@/components/merchants/merchant-location-map"),
  { ssr: false },
);

type MerchantDetailDrawerProps = {
  merchant: Merchant | null;
  isOpen: boolean;
  onClose: () => void;
};

const DEFAULT_HERO_BY_CATEGORY: Record<MerchantCategory, string> = {
  retail_goods: "/templates/retail-template.svg",
  dining_nightlife: "/templates/dining-template.svg",
  tech_digital: "/templates/tech-template.svg",
  travel_leisure: "/templates/travel-template.svg",
  wellness_beauty: "/templates/wellness-template.svg",
  professional_services: "/templates/professional-template.svg",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MerchantDetailDrawer({
  merchant,
  isOpen,
  onClose,
}: MerchantDetailDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [heroError, setHeroError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setCopied(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeroError(false);
    setLogoError(false);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && dialogRef.current) {
        const nodes = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close, merchant?.id]);

  if (!merchant) return null;

  const mapsQuery = encodeURIComponent(
    [merchant.fullAddress, merchant.city, merchant.country]
      .filter(Boolean)
      .join(", "),
  );
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const heroFallback = DEFAULT_HERO_BY_CATEGORY[merchant.category];
  const heroSrc = heroError ? heroFallback : merchant.heroImageUrl;
  const logoSrc = logoError ? heroFallback : merchant.logoUrl;
  const hasCoords =
    !merchant.isOnline &&
    typeof merchant.lat === "number" &&
    typeof merchant.lng === "number";

  return (
    <div
      className={`fixed inset-0 z-50 transition ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${merchant.name} merchant details`}
        className={`absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border border-gold-accent/80 bg-[#090313] shadow-2xl shadow-black/60 transition-transform duration-300 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-3xl ${isOpen ? "translate-y-0 sm:-translate-y-1/2" : "translate-y-full sm:-translate-y-[40%]"}`}
      >
        <div className="relative h-44 w-full overflow-hidden rounded-t-3xl sm:h-52">
          <Image
            src={heroSrc}
            alt={merchant.name}
            fill
            sizes="(min-width: 640px) 672px, 100vw"
            className="object-cover"
            onError={() => setHeroError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05020f] to-transparent" />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold-accent/45 bg-black/45 text-white"
            aria-label="Close merchant drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 pt-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10">
              <Image
                src={logoSrc}
                alt={`${merchant.name} logo`}
                fill
                sizes="48px"
                className="object-cover"
                onError={() => setLogoError(true)}
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{merchant.name}</h3>
              {merchant.isOnline ? (
                <span className="inline-flex rounded-full border border-gold-accent px-2 py-0.5 text-xs font-medium text-gold-accent">
                  Global/Online
                </span>
              ) : (
                <p className="text-xs text-violet-100/75">
                  {merchant.city}, {merchant.country}
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-violet-100/85">
            {merchant.description}
          </p>
          <p className="mt-3 text-sm font-semibold text-gold-accent">
            {merchant.discount}
          </p>

          <a
            href={merchant.ctaHref ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black"
          >
            {merchant.ctaLabel ?? "Visit Website"}
            <ExternalLink size={16} />
          </a>

          {merchant.isOnline ? (
            <div className="mt-4 rounded-xl border border-gold-accent/30 bg-[#120925] p-4">
              <p className="text-xs text-violet-100/70">Promo Code</p>
              <p className="mt-1 font-mono text-lg">
                {merchant.promoCode ?? "No active code"}
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!merchant.promoCode) return;
                  await navigator.clipboard.writeText(merchant.promoCode);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gold-accent/40 bg-[#1a0d33] px-3 py-2 text-sm"
              >
                <Copy size={14} />
                {copied ? "Copied!" : "Copy Promo Code"}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {hasCoords ? (
                <MerchantLocationMap
                  lat={merchant.lat as number}
                  lng={merchant.lng as number}
                  name={merchant.name}
                  address={merchant.fullAddress}
                />
              ) : null}
              <div className="rounded-xl border border-gold-accent/30 bg-[#120925] p-4">
                <p className="text-xs text-violet-100/70">Full Address</p>
                <p className="mt-1 text-sm text-violet-100/90">
                  {merchant.fullAddress}
                </p>
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gold-accent/40 bg-[#1a0d33] px-3 py-2 text-sm"
                >
                  <MapPin size={14} />
                  Open in Google Maps
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
