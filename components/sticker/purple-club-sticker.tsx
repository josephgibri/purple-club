"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { publicAsset } from "@/lib/public-asset";


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
 * customer's design tool. The dog mark is inlined as a data URI at
 * render time so the downloaded SVG stays portable — a merchant can drop it straight
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
  tagline = "Members get the discount at the counter",
  width = 360,
}: PurpleClubStickerProps) {
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [dogHref, setDogHref] = useState(publicAsset("/brand/dog.png"));

  useEffect(() => {
    let cancelled = false;
    fetch(publicAsset("/brand/dog.png"))
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .then((href) => {
        if (!cancelled) setDogHref(href);
      })
      .catch(() => {
        // Keep the public path. On-screen render still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <clipPath id="pc-dog-clip">
          <rect x="0" y="0" width="220" height="220" rx="12" />
        </clipPath>
      </defs>

      <rect width="600" height="750" rx="16" fill="#0D0B14" />
      <rect
        x="12"
        y="12"
        width="576"
        height="726"
        rx="12"
        fill="none"
        stroke="#8B5CF6"
        strokeWidth="1"
        opacity="0.7"
      />

      {/* Top eyebrow */}
      <g>
        <text
          x="300"
          y="72"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13"
          letterSpacing="6"
          fontWeight="700"
          fill="#8A8794"
        >
          MEMBER PLACE
        </text>
      </g>

      <g transform="translate(190 96)">
        <image
          href={dogHref}
          x="0"
          y="0"
          width="220"
          height="220"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      {/* Wordmark */}
      <text
        x="300"
        y="360"
        textAnchor="middle"
        fontFamily="ui-serif, Georgia, 'Times New Roman', serif"
        fontSize="52"
        fontWeight="700"
        fill="#E7E4DE"
        letterSpacing="2"
      >
        Purple Club
      </text>
      <text
        x="300"
        y="392"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        fontSize="13"
        letterSpacing="3"
        fontWeight="600"
        fill="#8A8794"
      >
        {tagline.toUpperCase()}
      </text>

      {/* QR plate. The QR is a nested <svg> whose own viewBox (set by the
          qrcode package — module-count squared) is auto-scaled into the
          184×184 inner area via preserveAspectRatio. That sidesteps the
          fragile "guess the module count and pre-scale" approach. */}
      <g transform="translate(190 416)">
        <rect width="220" height="220" rx="12" fill="#E7E4DE" />
        <rect
          x="6"
          y="6"
          width="208"
          height="208"
          rx="14"
          fill="none"
          stroke="#1a0a36"
          strokeWidth="2"
          opacity="0.25"
        />
        {qr ? (
          <svg
            x="18"
            y="18"
            width="184"
            height="184"
            viewBox={qr.viewBox}
            preserveAspectRatio="xMidYMid meet"
            dangerouslySetInnerHTML={{ __html: qr.inner }}
          />
        ) : !qrError ? (
          <text
            x="110"
            y="116"
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
            x="110"
            y="116"
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
        y="674"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="14"
        letterSpacing="2.5"
        fontWeight="600"
        fill="#8A8794"
      >
        SCAN TO JOIN
      </text>
      <text
        x="300"
        y="698"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="#55525F"
      >
        Hold 1 PBTC. The discount is at the counter.
      </text>
      <text
        x="300"
        y="722"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="11"
        letterSpacing="2"
        fill="#8B5CF6"
      >
        purpleclub.org
      </text>
    </svg>
  );
}
