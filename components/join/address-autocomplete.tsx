"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FsqMatch } from "@/lib/foursquare";

export type AddressSelection = {
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  fsqId: string;
  fsqName: string;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (next: string) => void;
  onSelect: (selection: AddressSelection) => void;
  /**
   * Bias the search toward a city / country string passed to Foursquare's
   * `near` parameter. Without this Foursquare returns global results and
   * the merchant typically has to type a much longer query to find a
   * useful match.
   */
  near?: string;
  /** Optional `lat,lng` to bias even more aggressively than `near`. */
  ll?: string;
  placeholder?: string;
  disabled?: boolean;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;
const PROVIDER_DEGRADED_COPY =
  "Address suggestions are temporarily unavailable. Type freeform — it'll still save.";

/**
 * Render the dropdown only when it would actually show something
 * useful. Without this guard, a provider-degraded state leaves an
 * empty amber-tinted panel hovering over the map for the rest of
 * the typing session — a screenshot the user pinged us about.
 *
 * Rules: show if (a) we have results, (b) we're actively loading,
 * or (c) we have an error message AND no results AND no loading
 * spinner has been emitted yet. After the user keeps typing past
 * a transient error, the next successful response will repopulate
 * `results` or reset `providerError`, so the panel naturally returns.
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
 * Foursquare-powered address autocomplete. Replaces the old
 * "Search Foursquare" button — the merchant just starts typing the
 * shop's name or address, and we live-suggest matches scoped to the
 * city/country they've already picked. Selecting a match fills the
 * full address + lat/lng + fsqId, which doubles as our admin
 * verification badge so nothing is lost from the old flow.
 *
 * Gracefully degrades when the Foursquare endpoint returns 503
 * (FOURSQUARE_API_KEY unset): the input still accepts typing, just
 * without suggestions — the merchant can submit a freeform address.
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  const { value, onChange, onSelect, near, ll, placeholder, disabled } = props;
  const [results, setResults] = useState<FsqMatch[]>([]);
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
        if (ll) params.set("ll", ll);
        else if (near) params.set("near", near);
        const res = await fetch(`/api/places/search?${params.toString()}`);
        const data = (await res.json()) as { matches?: FsqMatch[]; error?: string };
        // Ignore late responses for stale queries.
        if (lastQueryRef.current !== trimmed) return;
        if (!res.ok) {
          // Collapse every "provider broken" status (401 unauth,
          // 403 forbidden, 429 rate-limit, 5xx upstream-down, plus
          // any 502 from our own route) to the same friendly copy
          // so an env mishap or transient Foursquare hiccup doesn't
          // make the whole onboarding step look broken.
          if (
            res.status === 401 ||
            res.status === 403 ||
            res.status === 429 ||
            res.status === 502 ||
            res.status === 503 ||
            res.status >= 500
          ) {
            setProviderError(PROVIDER_DEGRADED_COPY);
          } else {
            setProviderError(data.error ?? "Suggestions unavailable.");
          }
          setResults([]);
          return;
        }
        setProviderError(null);
        setResults(data.matches ?? []);
      } catch {
        setProviderError(PROVIDER_DEGRADED_COPY);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [near, ll],
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

  function pick(match: FsqMatch) {
    onSelect({
      address: match.address || value,
      city: match.city,
      country: match.country,
      lat: match.lat,
      lng: match.lng,
      fsqId: match.id,
      fsqName: match.name,
    });
    onChange(match.address || value);
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
        placeholder={placeholder ?? "Start typing the shop name or address"}
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
              {results.map((match, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={match.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(match);
                      }}
                      className={
                        "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm " +
                        (isActive
                          ? "bg-purple-accent/20 text-white"
                          : "text-violet-100/90 hover:bg-white/5")
                      }
                    >
                      <span className="truncate font-semibold">{match.name}</span>
                      <span className="truncate text-[11px] text-violet-100/65">
                        {match.address || "—"}
                        {match.category ? ` · ${match.category}` : ""}
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
