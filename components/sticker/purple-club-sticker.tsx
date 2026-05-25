"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { PURPLE_BITCOIN_ICON_DATA_URI } from "@/lib/purple-bitcoin-icon";

type PurpleClubStickerProps = {
  /** Absolute URL the QR code resolves to. */
  qrUrl: string;
  /** Optional accent line displayed under the wordmark. */
  tagline?: string;
  /** Size in CSS pixels for screen rendering. SVG itself is scalable. */
  width?: number;
};

/**
 * Self-contained Purple Club window sticker as inline SVG so it
 * downloads sharp, prints crisp, and survives copy-paste into a
 * customer's design tool. The PurpleBitcoin (PBTC) glyph is embedded
 * as a base64 data URI (see `lib/purple-bitcoin-icon.ts`) so the
 * downloaded SVG is fully portable — a merchant can drop it straight
 * into Canva or their print shop's preflight tool without missing
 * assets, and the canvas-based PNG export below stays untainted (no
 * cross-origin image loads).
 *
 * Sized 4:5 portrait (600 × 750) which prints comfortably as a
 * 4"x5" window cling at 150 DPI or 5.3"x6.7" at 112 DPI.
 */
type QrPayload = { viewBox: string; inner: string };

export function PurpleClubSticker({
  qrUrl,
  tagline = "Enjoy exclusive discounts for holding 1 PBTC",
  width = 360,
}: PurpleClubStickerProps) {
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(qrUrl, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: {
        dark: "#1a0a36",
        light: "#0000",
      },
    })
      .then((svg) => {
        if (cancelled) return;
        // Extract viewBox + inner content from the package output so we
        // can nest it inside our own <svg> and let SVG's preserveAspectRatio
        // scale the QR to whatever box we give it (regardless of module
        // count picked by the encoder).
        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        const inner = svg
          .replace(/^[\s\S]*?<svg[^>]*>/, "")
          .replace(/<\/svg>\s*$/, "");
        setQr({
          viewBox: viewBoxMatch?.[1] ?? "0 0 25 25",
          inner,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setQrError(err instanceof Error ? err.message : "QR render failed");
      });
    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 750"
      width={width}
      style={{ width, height: "auto" }}
      role="img"
      aria-label="Purple Club member merchant window sticker"
      data-purple-club-sticker
    >
      <defs>
        <linearGradient id="pc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a0b3d" />
          <stop offset="100%" stopColor="#4b1da0" />
        </linearGradient>
        <linearGradient id="pc-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F5D78E" />
          <stop offset="45%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#A8812A" />
        </linearGradient>
        <linearGradient id="pc-gold-soft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFE9B0" />
          <stop offset="50%" stopColor="#E8C45A" />
          <stop offset="100%" stopColor="#B8892E" />
        </linearGradient>
        <radialGradient id="pc-spot" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#7b2ff7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#1a0b3d" stopOpacity="0" />
        </radialGradient>
        {/* Circular crop for the PBTC PNG — the source asset has a dark
            navy square baked behind the magenta circle, so we clip it out
            and let the purple sticker gradient show through the corners. */}
        <clipPath id="pc-coin-clip">
          <circle cx="64" cy="64" r="60" />
        </clipPath>
      </defs>

      <rect width="600" height="750" rx="48" fill="url(#pc-bg)" />
      <rect width="600" height="400" rx="48" fill="url(#pc-spot)" />
      <rect
        x="12"
        y="12"
        width="576"
        height="726"
        rx="40"
        fill="none"
        stroke="url(#pc-gold)"
        strokeWidth="2"
        opacity="0.55"
      />

      {/* Top eyebrow */}
      <g>
        <rect
          x="160"
          y="58"
          width="280"
          height="34"
          rx="17"
          fill="none"
          stroke="url(#pc-gold)"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="80"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
          fontSize="13"
          letterSpacing="6"
          fontWeight="700"
          fill="#F5D78E"
        >
          MEMBER MERCHANT
        </text>
      </g>

      {/* PurpleBitcoin coin — base64 from lib/purple-bitcoin-icon.ts,
          clipped to a circle via #pc-coin-clip so the source PNG's dark
          navy backdrop disappears and the brand mark sits cleanly on the
          gradient. 128×128 leaves ~30px of breathing room above the
          wordmark below at y=340. */}
      <g transform="translate(236 118)">
        <image
          href={PURPLE_BITCOIN_ICON_DATA_URI}
          x="0"
          y="0"
          width="128"
          height="128"
          preserveAspectRatio="xMidYMid meet"
          clipPath="url(#pc-coin-clip)"
        />
      </g>

      {/* Wordmark */}
      <text
        x="300"
        y="340"
        textAnchor="middle"
        fontFamily="ui-serif, Georgia, 'Times New Roman', serif"
        fontSize="52"
        fontWeight="700"
        fill="#FFFFFF"
        letterSpacing="2"
      >
        Purple Club
      </text>
      <text
        x="300"
        y="372"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        fontSize="13"
        letterSpacing="3"
        fontWeight="600"
        fill="#DDD6FE"
      >
        {tagline.toUpperCase()}
      </text>

      {/* QR plate. The QR is a nested <svg> whose own viewBox (set by the
          qrcode package — module-count squared) is auto-scaled into the
          200×200 inner area via preserveAspectRatio. That sidesteps the
          fragile "guess the module count and pre-scale" approach. */}
      <g transform="translate(180 400)">
        <rect width="240" height="240" rx="20" fill="#F5D78E" />
        <rect
          x="6"
          y="6"
          width="228"
          height="228"
          rx="14"
          fill="none"
          stroke="#1a0a36"
          strokeWidth="2"
          opacity="0.25"
        />
        {qr ? (
          <svg
            x="20"
            y="20"
            width="200"
            height="200"
            viewBox={qr.viewBox}
            preserveAspectRatio="xMidYMid meet"
            dangerouslySetInnerHTML={{ __html: qr.inner }}
          />
        ) : !qrError ? (
          <text
            x="120"
            y="125"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="14"
            fill="#1a0a36"
            opacity="0.6"
          >
            Generating QR…
          </text>
        ) : (
          <text
            x="120"
            y="125"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="12"
            fill="#b91c1c"
          >
            QR error
          </text>
        )}
      </g>

      <text
        x="300"
        y="670"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="14"
        letterSpacing="2.5"
        fontWeight="600"
        fill="#DDD6FE"
      >
        SCAN TO JOIN
      </text>
      <text
        x="300"
        y="694"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="#A89BD1"
      >
        Hold 1 PBTC on Solana to unlock the discount
      </text>
      <text
        x="300"
        y="722"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="11"
        letterSpacing="2"
        fill="#F5D78E"
      >
        purpleclub.xyz
      </text>
    </svg>
  );
}
