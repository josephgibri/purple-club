"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AddressSuggestion } from "@/lib/geocode";

export type AddressSelection = {
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (next: string) => void;
  onSelect: (selection: AddressSelection) => void;
  /**
   * ISO 3166-1 alpha-2 country code to scope autocomplete results.
   * Forwarded to Nominatim's `countrycodes` parameter so a Cairo
   * merchant doesn't see results from Cairo, Illinois.
   */
  countryCode?: string;
  placeholder?: string;
  disabled?: boolean;
};

const MIN_QUERY = 3;
const DEBOUNCE_MS = 500;
const PROVIDER_DEGRADED_COPY =
  "Address suggestions are temporarily unavailable. Type freeform — it'll still save.";

/**
 * Render the dropdown only when it would actually show something
 * useful — empty panels hovering over the form are confusing.
 */
function shouldShowDropdown(
  resultsLength: number,
  isLoading: boolean,
  providerError: string | null,
): boolean {
  if (resultsLength > 0) return true;
  if (isLoading) return true;
  if (providerError) return true;
  return false;
}

/**
 * OpenStreetMap-powered address autocomplete. The merchant starts
 * typing their street or shop name and we live-suggest matches
 * scoped to the country they've already picked. Selecting a match
 * fills the full address + city + country + lat/lng in one go.
 *
 * Backed by `/api/geocode/search` → Nominatim, so it works in every
 * country without any API key. Suggestions and the map tiles share
 * the same OSM dataset, so what the merchant picks here always
 * lines up with where the pin lands on the map below.
 *
 * Gracefully degrades when the upstream geocoder is rate-limited
 * or unreachable: the input still accepts typing, just without
 * suggestions, and pin-drag reverse-geocoding stays available as a
 * fallback.
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  const {
    value,
    onChange,
    onSelect,
    countryCode,
    placeholder,
    disabled,
  } = props;
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY) {
        setResults([]);
        return;
      }
      lastQueryRef.current = trimmed;
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (countryCode) params.set("country", countryCode);
        const res = await fetch(`/api/geocode/search?${params.toString()}`);
        const data = (await res.json()) as {
          suggestions?: AddressSuggestion[];
          error?: string;
        };
        if (lastQueryRef.current !== trimmed) return;
        if (!res.ok) {
          setProviderError(
            res.status === 503 || res.status >= 500
              ? PROVIDER_DEGRADED_COPY
              : (data.error ?? "Suggestions unavailable."),
          );
          setResults([]);
          return;
        }
        setProviderError(null);
        setResults(data.suggestions ?? []);
      } catch {
        setProviderError(PROVIDER_DEGRADED_COPY);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [countryCode],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, runSearch]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(suggestion: AddressSuggestion) {
    onSelect({
      address: suggestion.label,
      city: suggestion.city,
      country: suggestion.country,
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
    onChange(suggestion.label);
    setIsOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        results.length === 0 ? 0 : (prev + 1) % results.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        results.length === 0 ? 0 : (prev - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      if (results.length > 0) {
        event.preventDefault();
        pick(results[activeIndex] ?? results[0]);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "Start typing your street or shop name"}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (value.trim().length >= MIN_QUERY) setIsOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent disabled:opacity-50"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="address-autocomplete-listbox"
        role="combobox"
      />
      {isOpen && shouldShowDropdown(results.length, isLoading, providerError) ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/30">
          {isLoading && results.length === 0 ? (
            <p className="px-4 py-2 text-xs text-violet-100/70">Searching…</p>
          ) : null}
          {providerError && results.length === 0 && !isLoading ? (
            <p className="px-4 py-2 text-[11px] text-amber-200/85">
              {providerError}
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul
              id="address-autocomplete-listbox"
              role="listbox"
              className="max-h-72 overflow-auto"
            >
              {results.map((suggestion, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={suggestion.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(suggestion);
                      }}
                      className={
                        "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm " +
                        (isActive
                          ? "bg-purple-accent/20 text-white"
                          : "text-violet-100/90 hover:bg-white/5")
                      }
                    >
                      <span className="truncate font-semibold">
                        {suggestion.primary}
                      </span>
                      <span className="truncate text-[11px] text-violet-100/65">
                        {suggestion.secondary || suggestion.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
