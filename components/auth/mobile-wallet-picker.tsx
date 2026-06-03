"use client";

import { phantomDeeplink, solflareDeeplink } from "@/lib/device";
import { useMobileWallet } from "./mobile-wallet-context";
import { usePurpleWalletContext } from "./purple-wallet-provider";
import { Portal } from "./portal";

/**
 * Query-string flag we add to the universal-link target so the page
 * can auto-resume the sign-in flow inside Phantom/Solflare's in-app
 * browser without a second tap. `MobileWalletHost` reads this on mount
 * and routes the value back into `useWalletSignIn` via context so the
 * hook fires its SIWS state machine automatically.
 */
export const WALLET_AUTH_PARAM = "walletAuth";

export function buildWalletAuthUrl(wallet: "phantom" | "solflare"): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set(WALLET_AUTH_PARAM, wallet);
  return url.toString();
}

/**
 * Bottom sheet with Phantom + Solflare universal-link entry points.
 * Rendered instead of `@solana/wallet-adapter-react-ui`'s default
 * modal on every mobile external browser (iOS Safari and Android
 * Chrome):
 *
 *  - Android Chrome: the default modal often surfaces only one wallet
 *    via Mobile Wallet Adapter, stranding users who installed the
 *    other one.
 *  - iOS Safari: the Phantom adapter does fire its own universal
 *    link, but the page state is wiped on return and there's no
 *    `?walletAuth=` flag, so auto-resume can't pick up. Same fix as
 *    Android — we control the deeplink so we control the return URL.
 *
 * Inside a wallet's WebView we don't render this picker at all; the
 * hook selects the injected adapter directly.
 */
export function MobileWalletPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const purpleWallet = usePurpleWalletContext();
  const { setPendingResume } = useMobileWallet();

  if (!open) return null;
  const goPhantom = () => {
    window.location.href = phantomDeeplink(buildWalletAuthUrl("phantom"));
  };
  const goSolflare = () => {
    window.location.href = solflareDeeplink(buildWalletAuthUrl("solflare"));
  };
  const goPurpleWallet = () => {
    onClose();
    // In-page flow: signal useWalletSignIn to select the Purple Wallet
    // Standard adapter and drive connect → unlock modal → SIWS. No deep
    // link needed since the wallet runs entirely in the browser.
    setPendingResume("purple");
  };
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-gold-accent/25 bg-[#0A051A] p-5 shadow-2xl shadow-black/50 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-wallet-picker-title"
        >
          <h3
            id="mobile-wallet-picker-title"
            className="pc-serif text-lg font-semibold text-white"
          >
            Connect your wallet
          </h3>
          <p className="mt-1 text-sm text-violet-100/65">
            Use the Purple Club built-in wallet, or open your preferred wallet app.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {/* Purple Wallet — always shown first, no deep-link needed */}
            <button
              type="button"
              onClick={goPurpleWallet}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-black/40"
              />
              Purple Wallet
              {purpleWallet.state === "none" && (
                <span className="ml-auto rounded-full border border-black/20 bg-black/15 px-2 py-0.5 text-[10px] tracking-wide">
                  New
                </span>
              )}
            </button>

            <div className="my-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-white/30">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={goPhantom}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#AB9FF2] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#C0B6FA]"
            >
              Continue with Phantom
            </button>
            <button
              type="button"
              onClick={goSolflare}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FFA94D] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#FFB870]"
            >
              Continue with Solflare
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-violet-100/55 hover:text-violet-100/85"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
