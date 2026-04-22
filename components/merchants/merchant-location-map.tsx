"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS_HREF = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_CSS_INTEGRITY =
  "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
const LEAFLET_ICON_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/`;

function ensureLeafletStylesheet() {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-purple-leaflet="1"]',
  );
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS_HREF;
  link.integrity = LEAFLET_CSS_INTEGRITY;
  link.crossOrigin = "";
  link.dataset.purpleLeaflet = "1";
  document.head.appendChild(link);
}

// Leaflet's path-guessing heuristic assumes images ship next to the CSS.
// We load CSS from a CDN, so pin the icon base URL explicitly.
type LeafletIconDefaultWithPath = typeof L.Icon.Default & {
  imagePath?: string;
};
(L.Icon.Default as LeafletIconDefaultWithPath).imagePath = LEAFLET_ICON_BASE;

type MerchantLocationMapProps = {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  className?: string;
};

const PURPLE_GOLD_PIN_ICON = L.divIcon({
  className: "purple-club-map-pin",
  html: `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #f4c978 0%, #a46ef7 55%, #5a2aa0 100%);
      border: 2px solid #f5d785;
      box-shadow: 0 4px 14px rgba(0,0,0,0.45);
      transform: translate(-50%, -100%);
    "></div>
  `,
  iconSize: [28, 28],
  iconAnchor: [0, 0],
});

export default function MerchantLocationMap(props: MerchantLocationMapProps) {
  const { lat, lng, name, address, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    ensureLeafletStylesheet();
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    L.marker([lat, lng], { icon: PURPLE_GOLD_PIN_ICON })
      .addTo(map)
      .bindPopup(
        `<strong>${escapeHtml(name)}</strong>${address ? `<br/><span>${escapeHtml(address)}</span>` : ""}`,
      );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, name, address]);

  return (
    <div
      ref={containerRef}
      className={
        className ?? "h-56 w-full overflow-hidden rounded-xl border border-border"
      }
      role="img"
      aria-label={`Map showing ${name}${address ? ` at ${address}` : ""}`}
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
