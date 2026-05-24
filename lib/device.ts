/**
 * Minimal user-agent + injected-wallet detection.
 *
 * Trimmed port of `purple-travel-app/src/lib/device.ts` — Purple Club
 * doesn't ship Solana Mobile Wallet Adapter or the universal-link
 * "browse" affordance yet, so we only carry what `/welcome` actually
 * needs: pick the right Phantom install link for the platform and
 * detect whether the user already has Phantom available so we can
 * skip the install step.
 */

export type InjectedWalletKind = "phantom" | "solflare" | null;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isIOS(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac; sniff the touch capability to disambiguate.
  return ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document;
}

export function isAndroid(): boolean {
  if (!isBrowser()) return false;
  return /Android/i.test(navigator.userAgent);
}

export function getInjectedWalletKind(): InjectedWalletKind {
  if (!isBrowser()) return null;
  const w = window as unknown as {
    solana?: { isPhantom?: boolean };
    phantom?: { solana?: { isPhantom?: boolean } };
    solflare?: { isSolflare?: boolean };
  };
  if (w.solana?.isPhantom || w.phantom?.solana?.isPhantom) return "phantom";
  if (w.solflare?.isSolflare) return "solflare";
  return null;
}

export function isInsideWalletBrowser(): boolean {
  return getInjectedWalletKind() !== null;
}

function getCurrentUrl(): string {
  if (!isBrowser()) return "";
  return window.location.href;
}

function getCurrentOrigin(): string {
  if (!isBrowser()) return "";
  return window.location.origin;
}

/**
 * Phantom universal-link "browse" intent.
 *
 *   https://phantom.app/ul/browse/<URL>?ref=<ref>
 *
 * The <URL> path segment must be encoded exactly once. The `ref` query param
 * is encoded as a normal query value. Double-encoding the path is what
 * causes Phantom to land on its app home instead of the dApp browser.
 */
export function phantomDeeplink(url?: string): string {
  if (!isBrowser()) return "https://phantom.app/";
  const target = url ?? getCurrentUrl();
  const ref = getCurrentOrigin();
  if (!target) return "https://phantom.app/";
  return `https://phantom.app/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`;
}
