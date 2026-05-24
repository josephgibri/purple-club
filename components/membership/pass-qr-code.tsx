"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type PassQrCodeProps = {
  url: string | null;
  size?: number;
  /**
   * `compact` shrinks the visual frame for the in-modal pass; the standalone
   * `/pass` page uses the default (larger) presentation so it's scannable
   * from arm's length across a crowded bar counter.
   */
  variant?: "default" | "compact";
};

/**
 * Renders a QR code that points at the `/verify` URL minted by `/api/pass/mint`.
 * Falls back to a quiet skeleton when no URL is available yet (still minting,
 * pass expired between renders, etc.) so the surrounding pass UI doesn't jump.
 */
export function PassQrCode({ url, size = 232, variant = "default" }: PassQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasRendered, setHasRendered] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let cancelled = false;
    setHasRendered(false);
    setRenderError(null);
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0d0720",
        light: "#f6c453",
      },
    })
      .then(() => {
        if (!cancelled) setHasRendered(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setRenderError(
          error instanceof Error ? error.message : "Could not draw QR.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  const frameClass =
    variant === "compact"
      ? "rounded-2xl border border-gold-accent/30 bg-[#f6c453] p-2"
      : "rounded-3xl border border-gold-accent/40 bg-[#f6c453] p-3";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={frameClass} style={{ width: size + 24, height: size + 24 }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="rounded-xl"
          aria-label="Membership verification QR code"
        />
        {!hasRendered && !renderError ? (
          <div
            className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0d0720]/60"
            style={{ width: size, height: size }}
          >
            Minting pass…
          </div>
        ) : null}
        {renderError ? (
          <div
            className="flex h-full w-full items-center justify-center px-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0d0720]/80"
            style={{ width: size, height: size }}
          >
            QR error
          </div>
        ) : null}
      </div>
    </div>
  );
}
