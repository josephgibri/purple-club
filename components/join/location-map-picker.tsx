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

type LeafletIconDefaultWithPath = typeof L.Icon.Default & {
  imagePath?: string;
};
(L.Icon.Default as LeafletIconDefaultWithPath).imagePath = LEAFLET_ICON_BASE;

export type ResolvedAddress = {
  address: string;
  city: string;
  country: string;
  countryCode: string;
};

type LocationMapPickerProps = {
  lat: number;
  lng: number;
  /**
   * Fired when the merchant drags the pin to a new location, or when
   * they click on the map. Receives the new coordinates so the parent
   * form can persist them back to `form.lat` / `form.lng`.
   */
  onMove: (lat: number, lng: number) => void;
  /**
   * Fired ~700ms after the pin settles, with the address Nominatim
   * resolved for the new coordinates. This is what makes the map the
   * primary address-entry mechanism: drop the pin, get the address.
   * The parent merges the resolved fields into the form so the
   * address input stays in sync.
   *
   * Skipped (callback never fires) when reverse geocoding fails so
   * the merchant's hand-typed address isn't blown away by a transient
   * upstream outage.
   */
  onAddressResolved?: (address: ResolvedAddress) => void;
  className?: string;
};

const PIN_ICON = L.divIcon({
  className: "purple-club-map-pin-picker",
  html: `
    <div style="
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #f4c978 0%, #a46ef7 55%, #5a2aa0 100%);
      border: 2px solid #f5d785;
      box-shadow: 0 4px 14px rgba(0,0,0,0.55);
      transform: translate(-50%, -100%);
      cursor: grab;
    "></div>
  `,
  iconSize: [30, 30],
  iconAnchor: [0, 0],
});

/**
 * Interactive map used during merchant signup. Same Leaflet recipe as
 * the read-only `MerchantLocationMap` used in the directory drawer,
 * but with a draggable pin and click-to-place behaviour so a merchant
 * whose autogeocoded address landed at the back of the mall can drop
 * it on their actual storefront.
 *
 * The component is fully controlled — the parent owns lat/lng. When
 * the parent updates them (e.g. after picking an address suggestion
 * or reverse-geocoded result), the marker and view animate to the
 * new coords without remounting the map.
 */
const REVERSE_DEBOUNCE_MS = 700;

export default function LocationMapPicker(props: LocationMapPickerProps) {
  const { lat, lng, onMove, onAddressResolved, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const reverseTimerRef = useRef<number | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);

  // Keep the callbacks fresh without remounting the map.
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    onAddressResolvedRef.current = onAddressResolved;
  }, [onAddressResolved]);

  const scheduleReverse = (nextLat: number, nextLng: number) => {
    if (!onAddressResolvedRef.current) return;
    if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current);
    if (reverseAbortRef.current) reverseAbortRef.current.abort();
    reverseTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      reverseAbortRef.current = controller;
      try {
        const params = new URLSearchParams({
          lat: String(nextLat),
          lng: String(nextLng),
        });
        const res = await fetch(`/api/geocode/reverse?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          suggestion?: {
            label: string;
            city: string;
            country: string;
            countryCode: string;
          } | null;
        };
        if (!data.suggestion) return;
        onAddressResolvedRef.current?.({
          address: data.suggestion.label,
          city: data.suggestion.city,
          country: data.suggestion.country,
          countryCode: data.suggestion.countryCode,
        });
      } catch {
        // Aborted by next drag or transient network error — fine.
      }
    }, REVERSE_DEBOUNCE_MS);
  };

  useEffect(() => {
    ensureLeafletStylesheet();
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [lat, lng],
      zoom: 16,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const marker = L.marker([lat, lng], { icon: PIN_ICON, draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onMoveRef.current(pos.lat, pos.lng);
      scheduleReverse(pos.lat, pos.lng);
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      onMoveRef.current(event.latlng.lat, event.latlng.lng);
      scheduleReverse(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current);
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // We intentionally omit lat/lng/scheduleReverse here — the next effect
    // handles parent-driven coordinate updates without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const next = L.latLng(lat, lng);
    if (!marker.getLatLng().equals(next)) {
      marker.setLatLng(next);
      map.setView(next, map.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={
        className ?? "h-64 w-full overflow-hidden rounded-xl border border-border"
      }
    />
  );
}
