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
        className={`border border-[var(--line)] bg-[var(--wall-2)] p-4 text-xs text-[var(--bone-dim)] ${className}`}
      >
        Preparing your steps…
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
        ? "Phantom is here."
        : "Phantom is a Solana wallet. Free. About a minute.",
    body: installStatus !== "done" ? <InstallPhantomCta /> : undefined,
  });

  if (needsOpenInPhantom) {
    phases.push({
      id: "open",
      step: step++,
      status: "active",
      title: "Open this page inside Phantom",
      hint: "The rest of this happens in Phantom's browser.",
      body: (
        <button
          type="button"
          onClick={handleOpenInPhantom}
          className="inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
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
    title: signStatus === "done" ? "Wallet signed in" : "Sign in",
    hint:
      signStatus === "done"
        ? "Signed in. Good for 24 hours."
        : "One signature. No fee. The club only reads the balance.",
    body:
      signStatus === "active" ? (
        <button
          type="button"
          onClick={() => void enter()}
          disabled={isSignInPending}
          className="inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)] disabled:opacity-60"
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
        : "Hold 1 PBTC",
    hint:
      buyStatus === "done"
        ? "The key is in the wallet."
        : "The key is 1 PBTC, held in your wallet. Buy it on Jupiter. The club never holds it.",
    body:
      buyStatus === "active" ? (
        <a
          href={JUPITER_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]"
        >
          Buy 1 PBTC on Jupiter
        </a>
      ) : undefined,
  });

  phases.push({
    id: "enter",
    step: step++,
    status: enterStatus,
    title: enterStatus === "active" ? "The club is open" : "Enter the club",
    hint:
      enterStatus === "active"
        ? "Places is open."
        : "Finish the steps. The club opens here.",
  });

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
        {phases.length} step{phases.length === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {phases.map((phase) => (
          <PhaseCard key={phase.id} phase={phase} />
        ))}
      </ol>
      <p className="text-[11px] text-[var(--bone-faint)]">
        A wallet is an app that holds the key. Setup is free.
      </p>
    </div>
  );
}

function PhaseCard({ phase }: { phase: Phase }) {
  const tone =
    phase.status === "active"
      ? "border-[var(--ink)] bg-[var(--wall-2)]"
      : "border-[var(--line)] bg-[var(--wall-2)]";
  return (
    <li
      className={`border p-4 ${tone}`}
      aria-current={phase.status === "active" ? "step" : undefined}
    >
      <div className="flex items-start gap-3">
        <StepBadge step={phase.step} status={phase.status} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              phase.status === "pending" ? "text-[var(--bone-dim)]" : "text-[var(--bone)]"
            }`}
          >
            {phase.title}
          </p>
          {phase.hint ? (
            <p className="mt-1 text-[11px] leading-snug text-[var(--bone-dim)]">{phase.hint}</p>
          ) : null}
          {phase.body ? <div className="mt-3">{phase.body}</div> : null}
        </div>
      </div>
    </li>
  );
}

function StepBadge({ step, status }: { step: number; status: PhaseStatus }) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-semibold";
  if (status === "done") {
    return (
      <span className={`${base} text-[var(--ok)]`} aria-label="completed">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return <span className={`${base} bg-[var(--ink)] text-[var(--bone)]`}>{step}</span>;
  }
  return (
    <span className={`${base} border border-[var(--line)] text-[var(--bone-faint)]`}>{step}</span>
  );
}
