"use client";

import { useEffect, useState } from "react";

import { getPbtcHolderCount } from "@/lib/pbtc-holders";

const CACHE_KEY = "pc_pbtc_holders_v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

type CachedSnapshot = {
  activeHolders: number;
  totalAccounts: number;
  fetchedAt: number;
};

type PbtcHoldersState = {
  activeHolders: number | null;
  totalAccounts: number | null;
  isLoading: boolean;
  error: string | null;
  fetchedAt: number | null;
};

function readCache(): CachedSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshot;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshot: CachedSnapshot): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

export function usePbtcHolders(): PbtcHoldersState {
  const [state, setState] = useState<PbtcHoldersState>({
    activeHolders: null,
    totalAccounts: null,
    isLoading: true,
    error: null,
    fetchedAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    const cached = readCache();
    if (cached) {
      setState({
        activeHolders: cached.activeHolders,
        totalAccounts: cached.totalAccounts,
        isLoading: false,
        error: null,
        fetchedAt: cached.fetchedAt,
      });
      return;
    }

    (async () => {
      try {
        const result = await getPbtcHolderCount();
        if (cancelled) return;
        const snapshot: CachedSnapshot = {
          activeHolders: result.activeHolders,
          totalAccounts: result.totalAccounts,
          fetchedAt: Date.now(),
        };
        writeCache(snapshot);
        setState({
          activeHolders: snapshot.activeHolders,
          totalAccounts: snapshot.totalAccounts,
          isLoading: false,
          error: null,
          fetchedAt: snapshot.fetchedAt,
        });
      } catch (value) {
        if (cancelled) return;
        setState({
          activeHolders: null,
          totalAccounts: null,
          isLoading: false,
          error: value instanceof Error ? value.message : "Failed to load holder count.",
          fetchedAt: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
