"use client";

import { useEffect, useState } from "react";

import { isAndroid, isIOS } from "@/lib/device";

/**
 * Platform-aware "Get Phantom" button. iOS → App Store, Android → Play
 * Store, everything else → Chrome Web Store (Phantom's `/download` page
 * handles the Firefox / Brave fallback).
 *
 * Inviting non-crypto visitors shouldn't make them pick a platform — we
 * pick for them based on user-agent and offer a small "other platforms"
 * escape hatch.
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
        className="text-center text-[11px] text-violet-100/55 underline-offset-2 hover:text-violet-100/85 hover:underline"
      >
        Other platforms · Firefox / Brave / desktop browsers
      </a>
    </div>
  );
}
