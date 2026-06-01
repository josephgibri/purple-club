"use client";

import { useEffect, useState } from "react";
import { isAndroid, isIOS } from "@/lib/device";

/**
 * Platform-aware "Get Phantom" button. On iOS we send people directly to
 * the App Store, on Android to Play Store, on desktop to the Chrome Web
 * Store (Phantom's own download page handles Firefox / Brave fallback).
 *
 * One button instead of "pick your platform" tiles — non-crypto invitees
 * shouldn't have to make a choice. We pick for them based on user-agent
 * and surface a small "other platforms" link as an escape hatch.
 */

const APP_STORE_URL =
  "https://apps.apple.com/app/phantom-solana-wallet/id1598432977";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.phantom";
const CHROME_STORE_URL =
  "https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_DOWNLOAD_PAGE = "https://phantom.app/download";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "desktop";
}

function platformCopy(platform: Platform) {
  switch (platform) {
    case "ios":
      return { label: "Get Phantom for iPhone", href: APP_STORE_URL };
    case "android":
      return { label: "Get Phantom for Android", href: PLAY_STORE_URL };
    default:
      return { label: "Add Phantom to Chrome", href: CHROME_STORE_URL };
  }
}

export type InstallPhantomCtaProps = {
  className?: string;
};

export function InstallPhantomCta({ className = "" }: InstallPhantomCtaProps) {
  const [platform, setPlatform] = useState<Platform>("desktop");

  // Run detection client-side only — SSR can't see user-agent reliably and
  // we want the first paint to show the right CTA without a flash.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform());
  }, []);

  const primary = platformCopy(platform);

  return (
    <div className={`flex flex-col items-stretch gap-2 ${className}`}>
      <a
        href={primary.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-black shadow-[0_8px_24px_rgba(171,159,242,0.35)] hover:bg-[#C0B6FA]"
      >
        {primary.label}
      </a>
      <a
        href={PHANTOM_DOWNLOAD_PAGE}
        target="_blank"
        rel="noreferrer"
        className="text-center text-[11px] text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
      >
        Other platforms · Firefox / Brave / desktop browsers
      </a>
    </div>
  );
}
