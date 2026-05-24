"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PassQrCode } from "@/components/membership/pass-qr-code";
import { usePassToken } from "@/hooks/usePassToken";

type MembershipPassCardProps = {
  enabled: boolean;
  walletAddress?: string;
  pbtcBalance: number;
  signaturePrefix?: string | null;
  signedAtIso?: string | null;
  variant?: "modal" | "standalone";
};

function formatClock(now: Date): string {
  return now.toLocaleTimeString("en-GB", { hour12: false });
}

function shortenWallet(address?: string): string {
  if (!address) return "Wallet connected";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The visual "membership card" — the *product itself* once a holder is in.
 *
 * Two presentation modes:
 *   - `modal` packs into the existing bottom-sheet dialog (compact QR,
 *      tighter spacing).
 *   - `standalone` is what `/pass` renders: bigger QR so a merchant can
 *      scan from across a counter, more breathing room, and a hint strip.
 *
 * Both share the same QR + live clock + countdown so behaviour is
 * identical regardless of where it's surfaced.
 */
export function MembershipPassCard({
  enabled,
  walletAddress,
  pbtcBalance,
  signaturePrefix,
  signedAtIso,
  variant = "modal",
}: MembershipPassCardProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [showVerification, setShowVerification] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { url, expiresAt, isMinting, error, refresh } = usePassToken({
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      setClock(formatClock(new Date()));
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const shortWallet = useMemo(() => shortenWallet(walletAddress), [walletAddress]);
  const signedAtLabel = useMemo(() => {
    if (!signedAtIso) return null;
    try {
      return new Date(signedAtIso).toLocaleString();
    } catch {
      return signedAtIso;
    }
  }, [signedAtIso]);

  const secondsLeft =
    expiresAt && expiresAt > now ? Math.ceil((expiresAt - now) / 1000) : 0;

  const isStandalone = variant === "standalone";
  const qrSize = isStandalone ? 264 : 196;

  return (
    <div
      className={
        isStandalone
          ? "relative overflow-hidden rounded-[36px] border border-gold-accent/40 bg-gradient-to-br from-[#1a0c39] via-[#2a1256] to-[#160a33] p-7 sm:p-9"
          : "relative overflow-hidden rounded-3xl border border-gold-accent/35 bg-gradient-to-br from-[#1a0c39] via-[#2a1256] to-[#160a33] p-5"
      }
    >
      <div className="hologram-shimmer pointer-events-none absolute -inset-[35%]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-gold-accent/90">
              Purple Club Pass
            </p>
            <h2
              className={
                isStandalone
                  ? "mt-3 text-3xl font-semibold text-white sm:text-4xl"
                  : "mt-3 text-2xl font-semibold text-white"
              }
            >
              Active Membership
            </h2>
            <p className="mt-1 text-xs text-emerald-200/90">Verified Active</p>
          </div>
          {isStandalone ? (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isMinting}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold-accent/40 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-accent hover:bg-black/40 disabled:opacity-60"
              aria-label="Refresh pass"
            >
              <RefreshCw size={12} className={isMinting ? "animate-spin" : ""} />
              {isMinting ? "Refreshing" : "Refresh"}
            </button>
          ) : null}
        </div>

        <div className={isStandalone ? "mt-6 flex flex-col items-center" : "mt-5 flex flex-col items-center"}>
          <PassQrCode url={url} size={qrSize} variant={isStandalone ? "default" : "compact"} />
          <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-violet-100/65">
            Merchant scan
            {secondsLeft > 0 ? (
              <>
                {" · "}
                <span className="font-mono text-gold-accent">{secondsLeft}s</span>
              </>
            ) : null}
          </p>
          {error ? (
            <p className="mt-2 max-w-xs text-center text-[11px] text-rose-200">
              {error}
            </p>
          ) : null}
        </div>

        <div className={isStandalone ? "mt-6 rounded-2xl border border-violet-200/20 bg-black/25 p-4" : "mt-5 rounded-2xl border border-violet-200/20 bg-black/25 p-4"}>
          <p className="text-xs text-violet-100/80">Live Verification Clock</p>
          <p
            className={
              isStandalone
                ? "font-mono text-5xl font-semibold tracking-wider text-gold-accent"
                : "font-mono text-4xl font-semibold tracking-wider text-gold-accent"
            }
          >
            {clock}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-violet-200/15 bg-black/20 p-3">
            <p className="text-xs text-violet-100/70">Wallet</p>
            <p className="mt-1 font-mono text-white">{shortWallet}</p>
          </div>
          <div className="rounded-xl border border-violet-200/15 bg-black/20 p-3">
            <p className="text-xs text-violet-100/70">PBTC Balance</p>
            <p className="mt-1 font-semibold text-white">
              {pbtcBalance.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}
            </p>
          </div>
        </div>

        {signaturePrefix || signedAtLabel ? (
          <div className="mt-4 rounded-xl border border-violet-200/15 bg-black/25">
            <button
              type="button"
              onClick={() => setShowVerification((v) => !v)}
              aria-expanded={showVerification}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-violet-100/80 hover:text-white"
            >
              View Verification Details
              <span aria-hidden className="text-sm">
                {showVerification ? "−" : "+"}
              </span>
            </button>
            {showVerification ? (
              <div className="space-y-2 border-t border-violet-200/10 px-4 py-3 text-xs text-violet-100/80">
                {signaturePrefix ? (
                  <p>
                    <span className="text-violet-100/60">Signature:</span>{" "}
                    <span className="font-mono text-violet-100">
                      {signaturePrefix}
                    </span>
                  </p>
                ) : null}
                {signedAtLabel ? (
                  <p>
                    <span className="text-violet-100/60">Signed at:</span>{" "}
                    <span className="font-mono text-violet-100">
                      {signedAtLabel}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
