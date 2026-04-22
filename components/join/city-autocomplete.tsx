"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CityTuple } from "@/data/cities";

export type CitySelection = {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
};

type CityAutocompleteProps = {
  value: string;
  onChange: (next: string) => void;
  onSelect: (selection: CitySelection) => void;
  placeholder?: string;
  disabled?: boolean;
  inputId?: string;
};

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

let citiesPromise: Promise<CityTuple[]> | null = null;

function loadCities(): Promise<CityTuple[]> {
  if (!citiesPromise) {
    citiesPromise = import("@/data/cities").then((mod) => mod.cities);
  }
  return citiesPromise;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function CityAutocomplete(props: CityAutocompleteProps) {
  const {
    value,
    onChange,
    onSelect,
    placeholder = "Start typing a city",
    disabled,
    inputId,
  } = props;

  const [results, setResults] = useState<CityTuple[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const trimmedValue = useMemo(() => normalise(value), [value]);

  const runSearch = useCallback(async (query: string) => {
    const normalised = normalise(query);
    if (normalised.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    const cities = await loadCities();
    const matches: CityTuple[] = [];
    for (const entry of cities) {
      if (entry[0].toLowerCase().startsWith(normalised)) {
        matches.push(entry);
      }
    }
    matches.sort((a, b) => b[5] - a[5]);
    setResults(matches.slice(0, MAX_RESULTS));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (trimmedValue.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void runSearch(trimmedValue);
    }, 150);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [trimmedValue, runSearch]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(entry: CityTuple) {
    const [name, cc, countryName, lat, lng] = entry;
    onChange(name);
    onSelect({ name, country: countryName, countryCode: cc, lat, lng });
    setIsOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((previous) =>
        results.length === 0 ? 0 : (previous + 1) % results.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) =>
        results.length === 0
          ? 0
          : (previous - 1 + results.length) % results.length,
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
        id={inputId}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (trimmedValue.length >= MIN_QUERY_LENGTH) setIsOpen(true);
          void loadCities();
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none focus:border-purple-accent disabled:opacity-50"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={inputId ? `${inputId}-listbox` : undefined}
        role="combobox"
      />
      {isOpen && (results.length > 0 || isLoading) ? (
        <ul
          id={inputId ? `${inputId}-listbox` : undefined}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-surface shadow-xl shadow-black/30"
        >
          {isLoading && results.length === 0 ? (
            <li className="px-4 py-2 text-xs text-violet-100/70">
              Searching…
            </li>
          ) : null}
          {results.map((entry, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={`${entry[0]}-${entry[1]}-${index}`} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(entry);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm " +
                    (isActive
                      ? "bg-purple-accent/20 text-white"
                      : "text-violet-100/90 hover:bg-white/5")
                  }
                >
                  <span className="truncate">{entry[0]}</span>
                  <span className="shrink-0 text-xs text-violet-100/70">
                    {entry[2]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
