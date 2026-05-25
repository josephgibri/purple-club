/**
 * Mobile detection + wallet deep-link helpers.
 *
 * Ported from PurpleStay's purple-travel-app and Purple Council's
 * battle-tested mobile flow. The short version:
 *
 *  * On Android Chrome, the default @solana/wallet-adapter-react-ui
 *    modal frequently surfaces only one wallet (the MWA path) and
 *    strands users whose preferred wallet is the other one. The
 *    install link works, but after install there's no callback that
 *    resumes the connect, so the user gets stuck.
 *
 *  * On iOS Safari, the Phantom adapter does fire its own universal
 *    link, but the page state is wiped on return and there's no
 *    `?walletAuth=` flag, so auto-resume can't pick up.
 *
 *  * Fix: detect a mobile external browser and route users through a
 *    custom bottom-sheet picker that fires universal-link "browse"
 *    intents directly:
 *      https://phantom.app/ul/browse/<url>?ref=<origin>
 *    The wallet app opens its own in-app browser on <url>, the dApp
 *    re-mounts inside that WebView, and the page auto-resumes the
 *    sign-in handshake using the `?walletAuth=phantom` flag we baked
 *    into <url>. See `components/auth/mobile-wallet-host.tsx`.
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

export function isMobile(): boolean {
  return isIOS() || isAndroid();
}

/**
 * True when we're on an Android device but NOT inside a wallet's in-app
 * browser. In this state we should bypass the default wallet adapter
 * modal — which on Android Chrome routes everything through Mobile
 * Wallet Adapter and hides one of the two wallets — and present our
 * own picker that fires universal-link deeplinks directly.
 */
export function isAndroidWebChrome(): boolean {
  return isAndroid() && !isInsideWalletBrowser();
}

/**
 * True when we're on a mobile device (iOS or Android) but NOT inside a
 * wallet's in-app browser. The standard wallet adapter modal is
 * unreliable on both — on Android it strands users via MWA, on iOS the
 * Phantom adapter's universal-link redirect loses page state on return.
 * Either way we want to show our own picker that fires a deeplink with
 * the `?walletAuth=` flag so auto-resume can kick in inside the
 * wallet's WebView.
 */
export function isMobileExternalBrowser(): boolean {
  return isMobile() && !isInsideWalletBrowser();
}

/**
 * True when we're inside a wallet's in-app browser on a mobile device.
 * Only in this case is it safe to assume the single injected provider
 * is the wallet the user actually wants (and not, e.g., a desktop user
 * with both Phantom + Solflare extensions installed where we should
 * still let them pick via the modal).
 */
export function isMobileWalletWebView(): boolean {
  return isMobile() && isInsideWalletBrowser();
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

/**
 * Solflare universal-link browse intent.
 *
 *   https://solflare.com/ul/v1/browse/<URL>?ref=<ref>
 */
export function solflareDeeplink(url?: string): string {
  if (!isBrowser()) return "https://solflare.com/";
  const target = url ?? getCurrentUrl();
  const ref = getCurrentOrigin();
  if (!target) return "https://solflare.com/";
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`;
}

/**
 * On Android Chrome, the moment after Phantom (or any wallet app)
 * returns control to the tab, Chrome's network stack can be briefly
 * unattached to the resumed tab. Any fetch issued in that 200-800ms
 * window throws `TypeError: Failed to fetch` immediately — the request
 * never even leaves the device. Retrying with a small backoff lets the
 * network layer reattach. No-op on every other platform — real network
 * errors fall through to the throw on the last attempt.
 */
export async function fetchWithResumeRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      const isResumeBlip =
        err instanceof TypeError &&
        typeof err.message === "string" &&
        /failed to fetch|networkerror|load failed/i.test(err.message);
      if (!isResumeBlip || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Network unavailable.");
}
