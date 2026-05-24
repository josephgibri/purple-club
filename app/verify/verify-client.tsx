"use client";

import { CheckCircle2, RotateCcw, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CameraScanner } from "@/components/verify/camera-scanner";

type VerifyResult =
  | {
      valid: true;
      wallet: string;
      balance: number;
      balanceSnapshot: number;
      sigPrefix: string;
      issuedAt: string;
      expiresAt: string;
      verifiedAt: string;
    }
  | {
      valid: false;
      reason: string;
      message: string;
    };

const MERCHANT_STORAGE_KEY = "purpleclub:verifier_merchant";

/**
 * Merchant-facing verifier.
 *
 * The verifier is intentionally session-less and access-less: a barista or
 * shop owner opens `purpleclub.xyz/verify` (or scans a QR pointing at it),
 * points the camera at a member's pass, and gets an instant pass/fail
 * decision. No accounts, no app store install, no "merchant onboarding"
 * dance — that's what kept the rest of the codebase from shipping a
 * scanner so far.
 *
 * Three entry points are supported:
 *   1. Direct deep-link with `?t=<jwt>` (the QR encodes this URL, so a
 *      phone's native camera app resolves to this page already in result
 *      mode — no scanning step required).
 *   2. Tap "Scan a pass" to open the camera and decode in-browser.
 *   3. Paste a verification URL when the camera can't focus (kiosks,
 *      desktop browsers, broken permissions).
 */
type VerifyClientProps = {
  initialToken: string | null;
  initialMerchantId: string | null;
};

export function VerifyClient({ initialToken, initialMerchantId }: VerifyClientProps) {
  const [mode, setMode] = useState<"idle" | "scanning" | "loading" | "result">(
    initialToken ? "loading" : "idle",
  );
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  // Once a merchant scans `/verify?m=<slug>` on their counter device
  // we remember the slug locally. Future taps on the same device omit
  // `?m=` (e.g. typing the URL by hand) but still get attributed to
  // the right merchant. They can clear it via the "switch merchant"
  // link in the footer.
  const [merchantId, setMerchantId] = useState<string | null>(initialMerchantId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialMerchantId) {
      try {
        window.localStorage.setItem(MERCHANT_STORAGE_KEY, initialMerchantId);
      } catch {
        // localStorage might be blocked in some private modes — fine.
      }
      return;
    }
    try {
      const stored = window.localStorage.getItem(MERCHANT_STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMerchantId(stored);
      }
    } catch {
      // Read failure — proceed unattributed.
    }
  }, [initialMerchantId]);

  const runVerify = useCallback(
    async (token: string) => {
      setMode("loading");
      setResult(null);
      try {
        const params = new URLSearchParams({ t: token });
        if (merchantId) params.set("m", merchantId);
        const res = await fetch(`/api/public/verify-pass?${params.toString()}`);
        const data = (await res.json()) as VerifyResult;
        setResult(data);
      } catch {
        setResult({
          valid: false,
          reason: "network",
          message: "Could not reach the verifier. Check your connection and try again.",
        });
      } finally {
        setMode("result");
      }
    },
    [merchantId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialToken) void runVerify(initialToken);
  }, [initialToken, runVerify]);

  function clearMerchant() {
    setMerchantId(null);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(MERCHANT_STORAGE_KEY);
      } catch {
        // ignore — best effort
      }
    }
  }

  const handleScan = useCallback(
    (raw: string) => {
      const token = extractToken(raw);
      if (!token) {
        setResult({
          valid: false,
          reason: "not_a_pass",
          message: "That QR isn't a Purple Club pass.",
        });
        setMode("result");
        return;
      }
      void runVerify(token);
    },
    [runVerify],
  );

  function reset() {
    setResult(null);
    setMode("idle");
    setPasteValue("");
  }

  function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    const token = extractToken(pasteValue.trim());
    if (!token) {
      setResult({
        valid: false,
        reason: "not_a_pass",
        message: "Paste a Purple Club /verify URL.",
      });
      setMode("result");
      return;
    }
    void runVerify(token);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl flex-col px-5 py-8">
      <div className="rounded-3xl border border-white/10 bg-surface p-6 shadow-2xl shadow-black/30">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
          Merchant verifier
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Scan a member&apos;s pass
        </h1>
        <p className="mt-2 text-sm text-violet-100/75">
          Point your camera at the QR on the Purple Club pass. No install, no
          account — works on any modern phone browser.
        </p>

        {mode === "idle" ? (
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setMode("scanning")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
            >
              <ScanLine size={16} />
              Open camera
            </button>
            <form onSubmit={submitPaste} className="space-y-2">
              <label
                htmlFor="paste-url"
                className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-100/55"
              >
                Or paste a verification URL
              </label>
              <div className="flex gap-2">
                <input
                  id="paste-url"
                  type="url"
                  inputMode="url"
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  placeholder="https://purpleclub.xyz/verify?t=…"
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none focus:border-emerald-300/50"
                />
                <button
                  type="submit"
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/90 hover:bg-white/15"
                >
                  Verify
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {mode === "scanning" ? (
          <div className="mt-6 flex flex-col gap-3">
            <CameraScanner isActive onResult={handleScan} />
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="self-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/80 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {mode === "loading" ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center">
            <div className="h-10 w-10 animate-pulse rounded-full border border-emerald-300/50 bg-emerald-400/20" />
            <p className="text-sm text-violet-100/80">Checking on-chain…</p>
          </div>
        ) : null}

        {mode === "result" && result ? (
          <ResultPanel result={result} onReset={reset} />
        ) : null}
      </div>

      <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-violet-100/45">
        Two-layer check · Signature + live PBTC balance
      </p>

      {merchantId ? (
        <p className="mt-2 text-center text-[11px] text-violet-100/55">
          Scans attributed to <strong className="text-violet-100">{merchantId}</strong>{" "}
          <button
            type="button"
            onClick={clearMerchant}
            className="ml-1 underline underline-offset-2 hover:text-violet-100"
          >
            switch
          </button>
        </p>
      ) : null}
    </main>
  );
}

type ResultPanelProps = {
  result: VerifyResult;
  onReset: () => void;
};

function ResultPanel({ result, onReset }: ResultPanelProps) {
  if (result.valid) {
    return (
      <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-6 text-center shadow-[0_0_50px_-15px_rgba(52,211,153,0.5)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-500/20 text-emerald-100">
          <CheckCircle2 size={28} />
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-emerald-50">
          Verified Member
        </h2>
        <p className="mt-1 text-sm text-emerald-100/80">
          Apply the Purple Club discount.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-left text-xs">
          <Stat label="Wallet" value={shorten(result.wallet)} mono />
          <Stat
            label="PBTC (live)"
            value={result.balance.toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}
          />
          <Stat label="Pass issued" value={formatTime(result.issuedAt)} />
          <Stat label="Expires" value={formatTime(result.expiresAt)} />
        </dl>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 hover:bg-black/40"
        >
          <RotateCcw size={12} />
          Scan another
        </button>
      </div>
    );
  }

  const expired = result.reason === "expired_token";
  const noPbtc = result.reason === "no_pbtc";

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-rose-400/50 bg-rose-500/10 p-6 text-center shadow-[0_0_50px_-15px_rgba(244,114,182,0.4)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-rose-300/60 bg-rose-500/20 text-rose-100">
        {expired ? <ShieldAlert size={28} /> : <XCircle size={28} />}
      </div>
      <h2 className="mt-3 text-2xl font-semibold text-rose-50">
        {expired
          ? "Pass Expired"
          : noPbtc
            ? "No Membership"
            : "Invalid Pass"}
      </h2>
      <p className="mt-2 text-sm text-rose-100/85">{result.message}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-rose-200/70">
        Reason: {result.reason}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 hover:bg-black/40"
      >
        <RotateCcw size={12} />
        Try again
      </button>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-emerald-300/20 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/55">
        {label}
      </p>
      <p className={`mt-1 text-sm text-emerald-50 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function shorten(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

/**
 * The QR encodes a full URL like `https://purpleclub.xyz/verify?t=<jwt>`,
 * but holders might also paste a raw JWT or some camera apps strip the
 * origin. Extract the `t` param if it looks like a URL, otherwise treat
 * the input as the raw token (with a basic shape check).
 */
function extractToken(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch {
    // Not a URL, fall through.
  }
  // Raw JWT: three dot-separated base64url segments.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return null;
}
