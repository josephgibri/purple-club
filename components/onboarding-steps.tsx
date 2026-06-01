"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getInjectedWalletKind,
  isAndroid,
  isAndroidWebChrome,
  isInsideWalletBrowser,
  isIOS,
  phantomDeeplink,
} from "@/lib/device";
import { InstallPhantomCta } from "@/components/install-phantom-cta";

/**
 * Custom event name that the membership pill listens for. Dispatching this
 * runs the canonical SIWS / Android-picker / error-handling flow already
 * owned by `MembershipPill` instead of duplicating it here.
 */
const VERIFY_EVENT = "purplestay:verify-wallet";

/**
 * Cold-start onboarding for non-crypto invitees on /claim/[code] and
 * /invite/[slug]. Replaces the old terse "Use the wallet pill in the top
 * right" hint with a stepped path that adapts to platform + detected
 * wallet state (2 steps on desktop, 2-3 steps on mobile depending on
 * whether the user has already opened the page inside Phantom's WebView).
 *
 * Goals:
 *  - One obvious primary CTA at each phase (install OR open OR connect)
 *  - Mobile users get an in-app deep link to Phantom so the rest of the
 *    flow happens inside Phantom's WebView where the wallet is available
 *  - Desktop users see a Chrome Web Store install link, then re-detect
 *    the extension automatically when the tab regains focus
 *
 * The component renders nothing once the user is authenticated — the
 * parent page takes over with the actual claim button.
 */

type Platform = "ios" | "android" | "desktop";

type PhaseStatus = "done" | "active" | "pending";

type Phase = {
  step: number;
  status: PhaseStatus;
  title: string;
  hint?: string;
  body?: ReactNode;
};

export type OnboardingStepsProps = {
  /** True when the visitor already has an authenticated wallet session. */
  authenticated: boolean;
  /**
   * Optional gating — when false the component renders nothing. Useful
   * when the gift / drop is already claimed and onboarding is moot.
   */
  shouldShow?: boolean;
  className?: string;
};

export function OnboardingSteps({
  authenticated,
  shouldShow = true,
  className = "",
}: OnboardingStepsProps) {
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
    // Re-run detection whenever the tab regains focus — covers the
    // "user just installed the Phantom extension and came back" case
    // without forcing a hard refresh.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        // Coalesce to once every 500ms — Chrome fires visibility + focus
        // back-to-back when popping out of the extension store.
        if (now - lastFocusedAt.current < 500) return;
        lastFocusedAt.current = now;
        refreshDetection();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [refreshDetection]);

  const handleConnect = useCallback(() => {
    // Delegate to the membership pill's verify state machine. The pill
    // listens for this event and runs the platform-aware flow (Android
    // deep-link picker, iOS universal link, desktop modal + SIWS).
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(VERIFY_EVENT));
  }, []);

  const handleOpenInPhantom = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = phantomDeeplink();
  }, []);

  if (!shouldShow) return null;
  if (authenticated) return null;
  // Avoid a hydration flash showing the "desktop" copy before client
  // detection runs — render a slim placeholder until we know the
  // platform.
  if (!hasMounted) {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/55 ${className}`}
      >
        Preparing your claim…
      </div>
    );
  }

  const isMobile = platform !== "desktop";
  const phases: Phase[] = [];

  if (isMobile) {
    if (insideWalletBrowser) {
      phases.push({
        step: 1,
        status: "done",
        title: "Phantom is ready",
        hint: "You're inside the Phantom in-app browser — let's sign in.",
      });
      phases.push({
        step: 2,
        status: "active",
        title: "Sign in with Phantom",
        hint: "One tap. We never see your seed phrase or private keys.",
        body: <ConnectButton onClick={handleConnect} />,
      });
    } else {
      phases.push({
        step: 1,
        status: "active",
        title: "Get Phantom (free, 60 seconds)",
        hint: "Phantom is the most popular Solana wallet — used by millions of people. Already have it? Skip to step 2.",
        body: <InstallPhantomCta />,
      });
      phases.push({
        step: 2,
        status: "active",
        title: "Open this invite inside Phantom",
        hint: isAndroidWebChrome()
          ? "On Android we open the page in Phantom's built-in browser, where signing in works in one tap."
          : "Tap below — Phantom's in-app browser is where you'll claim.",
        body: <OpenInPhantomButton onClick={handleOpenInPhantom} />,
      });
      phases.push({
        step: 3,
        status: "pending",
        title: "Sign in & receive 1 PBTC",
        hint: "Once you're inside Phantom, you'll see a one-tap sign-in here.",
      });
    }
  } else {
    // Desktop
    if (walletDetected) {
      phases.push({
        step: 1,
        status: "done",
        title: "Phantom is installed",
        hint: "Detected on this browser — let's sign in.",
      });
      phases.push({
        step: 2,
        status: "active",
        title: "Connect your wallet",
        hint: "Phantom will pop up and ask you to sign a free message — no transaction, no fee.",
        body: <ConnectButton onClick={handleConnect} />,
      });
    } else {
      phases.push({
        step: 1,
        status: "active",
        title: "Add Phantom to your browser",
        hint: "Phantom is the most popular Solana wallet — runs as a browser extension. Free, takes about 60 seconds.",
        body: <InstallPhantomCta />,
      });
      phases.push({
        step: 2,
        status: "pending",
        title: "Connect your wallet",
        hint: "Once Phantom is installed, this card will turn purple and you can sign in.",
        body: (
          <button
            type="button"
            onClick={refreshDetection}
            className="text-[11px] text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
          >
            Already installed? Re-check
          </button>
        ),
      });
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/55">
        Claim in {phases.length} quick step{phases.length === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {phases.map((phase) => (
          <PhaseCard key={phase.step} phase={phase} />
        ))}
      </ol>
      <p className="text-[10px] text-white/40">
        New to crypto? That&apos;s OK. A wallet is just an app that holds digital
        items — like a bank account, but you control the keys. Setting one up is
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
        ? "border-[#7C3AED]/55 bg-[#7C3AED]/12 text-white shadow-[0_0_24px_rgba(124,58,237,0.18)]"
        : "border-white/10 bg-black/30 text-white/55";
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
              phase.status === "pending" ? "text-white/65" : "text-white"
            }`}
          >
            {phase.title}
          </p>
          {phase.hint ? (
            <p
              className={`mt-1 text-[11px] leading-snug ${
                phase.status === "pending" ? "text-white/45" : "text-white/65"
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
        className={`${base} bg-[#7C3AED] text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]`}
      >
        {step}
      </span>
    );
  }
  return (
    <span
      className={`${base} border border-white/15 bg-transparent text-white/55`}
    >
      {step}
    </span>
  );
}

function ConnectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(171,159,242,0.35)] hover:bg-[#C0B6FA]"
    >
      Connect wallet & sign in
    </button>
  );
}

function OpenInPhantomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(171,159,242,0.35)] hover:bg-[#C0B6FA]"
    >
      Open this invite in Phantom
    </button>
  );
}
