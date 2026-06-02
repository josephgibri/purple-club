"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { InstallPhantomCta } from "@/components/onboarding/install-phantom-cta";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import {
  getInjectedWalletKind,
  isAndroid,
  isInsideWalletBrowser,
  isIOS,
  phantomDeeplink,
} from "@/lib/device";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/?utm_source=phantom&utm_medium=list&buy=${PBTC_MINT}`;

/**
 * Stepped onboarding flow rendered on `/welcome` for cold-start visitors
 * who scanned a Purple Club window sticker (or any inbound that lands on
 * `/welcome`). Adapted from `purple-travel-app/components/onboarding-steps`
 * but Purple Club has *no* gift PBTC — visitors must buy their own — so
 * the flow has a 4th step ("Buy 1 PBTC") and never shows a "Claim"
 * button.
 *
 * The component auto-advances based on detected state:
 *   1. Install Phantom (skipped if already detected)
 *   2. (Mobile only) Open this page inside Phantom
 *   3. Sign in (read-only signature)
 *   4. Buy 1 PBTC on Jupiter (skipped if balance >= 1)
 *   5. Enter the directory
 *
 * When the visitor reaches the last "verified + has PBTC" state the
 * parent `/welcome` page replaces this with a big "Enter Directory"
 * banner — we don't duplicate that here.
 */

type Platform = "ios" | "android" | "desktop";
type PhaseStatus = "done" | "active" | "pending";

type Phase = {
  id: "install" | "open" | "sign" | "buy" | "enter";
  step: number;
  status: PhaseStatus;
  title: string;
  hint?: string;
  body?: ReactNode;
};

export type OnboardingStepsProps = {
  className?: string;
};

export function OnboardingSteps({ className = "" }: OnboardingStepsProps) {
  const { connected } = useWallet();
  const { isVerified, hasPbtc, isMember, balance } = useMembershipGate();
  const { enter, isPending: isSignInPending } = useWalletSignIn();

  const [walletDetected, setWalletDetected] = useState(false);
  const [insideWalletBrowser, setInsideWalletBrowser] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [hasMounted, setHasMounted] = useState(false);
  const lastFocusedAt = useRef<number>(0);

  const refreshDetection = useCallback(() => {
    setWalletDetected(getInjectedWalletKind() !== null);
    setInsideWalletBrowser(isInsideWalletBrowser());
    setPlatform(isIOS() ? "ios" : isAndroid() ? "android" : "desktop");
    setHasMounted(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDetection();
    // Re-detect when the tab regains focus — covers the "user just
    // installed the Phantom extension and came back to this tab" case
    // without forcing a hard refresh.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusedAt.current < 500) return;
      lastFocusedAt.current = now;
      refreshDetection();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [refreshDetection]);

  const handleOpenInPhantom = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = phantomDeeplink();
  }, []);

  if (!hasMounted) {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-violet-100/55 ${className}`}
      >
        Preparing your onboarding…
      </div>
    );
  }

  const isMobile = platform !== "desktop";
  // On mobile, if a non-wallet browser is being used, we route through
  // Phantom's in-app browser instead of asking the user to fight WalletConnect.
  const needsOpenInPhantom = isMobile && !walletDetected && !insideWalletBrowser;

  const installStatus: PhaseStatus = walletDetected || insideWalletBrowser ? "done" : "active";
  const signStatus: PhaseStatus = isVerified
    ? "done"
    : connected
      ? "active"
      : installStatus === "done" && !needsOpenInPhantom
        ? "active"
        : "pending";
  const buyStatus: PhaseStatus = hasPbtc
    ? "done"
    : isVerified
      ? "active"
      : "pending";
  const enterStatus: PhaseStatus = isMember ? "active" : "pending";

  const phases: Phase[] = [];
  let step = 1;

  phases.push({
    id: "install",
    step: step++,
    status: installStatus,
    title:
      installStatus === "done"
        ? insideWalletBrowser
          ? "Phantom is ready"
          : "Phantom is installed"
        : isMobile
          ? "Get Phantom (free, 60 seconds)"
          : "Add Phantom to your browser",
    hint:
      installStatus === "done"
        ? "Detected — moving to sign-in."
        : "Phantom is the most popular Solana wallet — used by millions. Free, takes about a minute.",
    body: installStatus !== "done" ? <InstallPhantomCta /> : undefined,
  });

  if (needsOpenInPhantom) {
    phases.push({
      id: "open",
      step: step++,
      status: "active",
      title: "Open this page inside Phantom",
      hint:
        "Tap below — Phantom's in-app browser is where the rest of the flow happens on mobile.",
      body: (
        <button
          type="button"
          onClick={handleOpenInPhantom}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(171,159,242,0.35)] hover:bg-[#C0B6FA]"
        >
          Open this page in Phantom
        </button>
      ),
    });
  }

  phases.push({
    id: "sign",
    step: step++,
    status: signStatus,
    title:
      signStatus === "done"
        ? "Wallet signed in"
        : "Sign in (read-only)",
    hint:
      signStatus === "done"
        ? "Signature is good for 24 hours."
        : "One-tap signature in your wallet. No transaction, no fee — Purple Club only reads your PBTC balance.",
    body:
      signStatus === "active" ? (
        <button
          type="button"
          onClick={() => void enter()}
          disabled={isSignInPending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(171,159,242,0.35)] hover:bg-[#C0B6FA] disabled:opacity-60"
        >
          {isSignInPending ? "Waiting for wallet…" : "Connect & sign in"}
        </button>
      ) : undefined,
  });

  phases.push({
    id: "buy",
    step: step++,
    status: buyStatus,
    title:
      buyStatus === "done"
        ? `1 PBTC found in your wallet (${balance.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })})`
        : "Get 1 PBTC",
    hint:
      buyStatus === "done"
        ? "You meet the membership minimum."
        : "Purple Club is gated by holding ≥ 1 PBTC on Solana. Buy on Jupiter in a couple of taps — you keep custody, we never touch your tokens.",
    body:
      buyStatus === "active" ? (
        <a
          href={JUPITER_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-accent px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(246,196,83,0.35)] hover:brightness-110"
        >
          Buy 1 PBTC on Jupiter
        </a>
      ) : undefined,
  });

  phases.push({
    id: "enter",
    step: step++,
    status: enterStatus,
    title: enterStatus === "active" ? "You're in — enter the directory" : "Enter Purple Club",
    hint:
      enterStatus === "active"
        ? "Browse merchants, copy promo codes, show your live pass at any Purple Hub."
        : "Finish the steps above and the directory unlocks here automatically.",
  });

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-violet-100/55">
        {phases.length} quick step{phases.length === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {phases.map((phase) => (
          <PhaseCard key={phase.id} phase={phase} />
        ))}
      </ol>
      <p className="text-[10px] text-violet-100/45">
        New to crypto? A wallet is just an app that holds digital items —
        like a bank account, but you control the keys. Setting one up is
        free and takes a minute.
      </p>
    </div>
  );
}

function PhaseCard({ phase }: { phase: Phase }) {
  const tone =
    phase.status === "done"
      ? "border-emerald-300/30 bg-emerald-500/5 text-emerald-100"
      : phase.status === "active"
        ? "border-purple-accent/55 bg-purple-accent/12 text-white shadow-[0_0_24px_rgba(123,47,247,0.18)]"
        : "border-white/10 bg-black/30 text-violet-100/55";
  return (
    <li
      className={`rounded-2xl border p-4 transition ${tone}`}
      aria-current={phase.status === "active" ? "step" : undefined}
    >
      <div className="flex items-start gap-3">
        <StepBadge step={phase.step} status={phase.status} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              phase.status === "pending" ? "text-violet-100/65" : "text-white"
            }`}
          >
            {phase.title}
          </p>
          {phase.hint ? (
            <p
              className={`mt-1 text-[11px] leading-snug ${
                phase.status === "pending" ? "text-violet-100/45" : "text-violet-100/70"
              }`}
            >
              {phase.hint}
            </p>
          ) : null}
          {phase.body ? <div className="mt-3">{phase.body}</div> : null}
        </div>
      </div>
    </li>
  );
}

function StepBadge({ step, status }: { step: number; status: PhaseStatus }) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold";
  if (status === "done") {
    return (
      <span
        className={`${base} bg-emerald-400/20 text-emerald-200`}
        aria-label="completed"
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className={`${base} bg-purple-accent text-white shadow-[0_0_12px_rgba(123,47,247,0.5)]`}
      >
        {step}
      </span>
    );
  }
  return (
    <span className={`${base} border border-white/15 bg-transparent text-violet-100/55`}>
      {step}
    </span>
  );
}
