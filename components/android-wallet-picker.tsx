"use client";

import { phantomDeeplink, solflareDeeplink } from "@/lib/device";

/**
 * Query-string flag we add to the universal-link target so the page can
 * auto-resume the SIWS flow inside Phantom/Solflare's in-app browser
 * without a second tap. `MembershipPill` reads this and calls the right
 * adapter's `select(...)` after parsing the param.
 */
export const WALLET_AUTH_PARAM = "walletAuth";

export function buildWalletAuthUrl(wallet: "phantom" | "solflare"): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set(WALLET_AUTH_PARAM, wallet);
  return url.toString();
}

/**
 * Bottom sheet with Phantom + Solflare universal-link entry points. We
 * render this instead of `@solana/wallet-adapter-react-ui`'s default modal
 * on Android Chrome because the modal there often surfaces only one
 * wallet (the MWA path), which strands users who installed the *other*
 * wallet. Mirrors the homepage UX so members see the same two options
 * everywhere we ask them to connect.
 */
export function AndroidWalletPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const goPhantom = () => {
    window.location.href = phantomDeeplink(buildWalletAuthUrl("phantom"));
  };
  const goSolflare = () => {
    window.location.href = solflareDeeplink(buildWalletAuthUrl("solflare"));
  };
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0A051A] p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="android-wallet-picker-title"
      >
        <h3
          id="android-wallet-picker-title"
          className="pt-serif text-lg font-semibold text-white"
        >
          Open with your wallet
        </h3>
        <p className="mt-1 text-sm text-white/60">
          Sign in inside your wallet&apos;s app.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={goPhantom}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#AB9FF2] px-4 py-3 text-sm font-semibold text-black hover:bg-[#C0B6FA]"
          >
            Continue with Phantom
          </button>
          <button
            type="button"
            onClick={goSolflare}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FFA94D] px-4 py-3 text-sm font-semibold text-black hover:bg-[#FFB870]"
          >
            Continue with Solflare
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/55 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
