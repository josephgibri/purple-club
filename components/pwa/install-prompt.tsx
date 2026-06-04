"use client";

import Image from "next/image";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * App-wide "Install Purple Club" prompt.
 *
 * Modern Chrome/Edge on Android no longer auto-show an install banner — they
 * fire `beforeinstallprompt`, which the site must capture and trigger from a
 * button. iOS Safari never fires that event at all, so it gets a short
 * "Share → Add to Home Screen" hint instead. We hide everything once the app
 * is already installed (standalone display-mode) and remember dismissals so we
 * don't nag on every visit.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pc_pwa_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneDisplay = window.matchMedia?.(
    "(display-mode: standalone)",
  ).matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
    true;
  return Boolean(standaloneDisplay || iosStandalone);
}

function isIos(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const iPhoneOrPad = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ masquerades as a Mac — detect the touch screen to catch it.
  const iPadOS = /Macintosh/.test(ua) && "ontouchend" in document;
  return iPhoneOrPad || iPadOS;
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode / storage disabled — fall back to in-memory state only.
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      rememberDismissed();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt — surface the manual hint after a beat
    // so it doesn't slam in during first paint.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => {
        setShowIosHelp(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    rememberDismissed();
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice.outcome !== "accepted") {
      // Let them try again later from the browser menu; don't hard-suppress.
    } else {
      rememberDismissed();
    }
  }, [deferred]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-purple-accent/30 bg-[#0b0618]/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-violet-100/60 hover:bg-white/10 hover:text-white"
      >
        <X size={15} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="shrink-0 overflow-hidden rounded-xl border border-white/10">
          <Image
            src="/purple-club-icon-192.png"
            alt="Purple Club"
            width={44}
            height={44}
          />
        </span>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Install Purple Club</p>

          {showIosHelp ? (
            <p className="mt-1 text-xs leading-relaxed text-violet-100/75">
              Tap{" "}
              <Share size={12} className="inline -translate-y-px text-violet-100" />{" "}
              <span className="font-medium text-white">Share</span>, then{" "}
              <SquarePlus
                size={12}
                className="inline -translate-y-px text-violet-100"
              />{" "}
              <span className="font-medium text-white">Add to Home Screen</span>{" "}
              for the full-screen app.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-violet-100/75">
              Add it to your home screen for one-tap access to your membership,
              wallet and perks.
            </p>
          )}

          {!showIosHelp ? (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-purple-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-accent/85"
            >
              <Download size={13} />
              Install app
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
