"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PurpleClubSticker } from "@/components/sticker/purple-club-sticker";

type StickerClientProps = {
  merchantId: string | null;
};

/**
 * Interactive shell around `PurpleClubSticker`. Provides:
 *   - Live preview at a sensible print scale
 *   - Download as SVG (vector, infinite resolution)
 *   - Download as PNG (raster, easier for messaging apps & email)
 *   - Print (browser print dialog with print-only stylesheet)
 *
 * The print stylesheet hides the page chrome and prints just the
 * sticker, sized to a 4"×5" portrait card. Merchants can switch their
 * print dialog to "fit to page" if their stock differs.
 *
 * `merchantId` is woven into the QR URL so a sticker on Lucky
 * Barbershop's window resolves to `/welcome?via=sticker&merchant=lucky-barbershop`,
 * which we already attribute in `welcome-client.tsx`.
 */
export function StickerClient({ merchantId }: StickerClientProps) {
  const [origin, setOrigin] = useState<string>("https://purpleclub.xyz");
  const stickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(`${window.location.origin}${basePath}`);
  }, []);

  const qrUrl = useMemo(() => {
    const params = new URLSearchParams({ via: "sticker" });
    if (merchantId) params.set("merchant", merchantId);
    return `${origin}/welcome?${params.toString()}`;
  }, [origin, merchantId]);

  function getSvgElement(): SVGSVGElement | null {
    return stickerRef.current?.querySelector<SVGSVGElement>(
      "svg[data-purple-club-sticker]",
    ) ?? null;
  }

  function serializeSticker(): string | null {
    const svg = getSvgElement();
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Strip the React-set inline width/height so the SVG is fluid at
    // whatever size the consumer drops it into.
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadSvg() {
    const serialized = serializeSticker();
    if (!serialized) return;
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    downloadBlob(blob, fileBase("svg"));
  }

  async function downloadPng() {
    const serialized = serializeSticker();
    if (!serialized) return;
    // Render at 3× target resolution so the PNG looks crisp when
    // shared on Telegram / printed at small sizes.
    const exportWidth = 1200;
    const exportHeight = 1500;
    const svgBlob = new Blob([serialized], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = exportWidth;
          canvas.height = exportHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas 2D context unavailable."));
            return;
          }
          ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("PNG export failed."));
              return;
            }
            downloadBlob(blob, fileBase("png"));
            resolve();
          }, "image/png");
        };
        img.onerror = () => reject(new Error("PNG export failed."));
        img.src = svgUrl;
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function fileBase(ext: string): string {
    const slug = merchantId ? `-${merchantId}` : "";
    return `purple-club-sticker${slug}.${ext}`;
  }

  function printSticker() {
    window.print();
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl flex-col px-5 py-10 sm:py-14 print:m-0 print:max-w-none print:p-0">
      <div className="print:hidden">
        <Link
          href="/join"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-violet-100/60 hover:text-violet-100/90"
        >
          <ArrowLeft size={12} />
          Back
        </Link>
      </div>

      <div className="mt-4 grid gap-8 print:m-0 sm:grid-cols-[1fr_320px] print:block">
        <div ref={stickerRef} className="flex justify-center print:m-0">
          <PurpleClubSticker qrUrl={qrUrl} width={380} />
        </div>

        <aside className="space-y-5 print:hidden">
          <div className="rounded-3xl border border-gold-accent/40 bg-surface p-6 shadow-2xl shadow-black/30">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-accent">
              Window sticker
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Show you accept Purple Club
            </h1>
            <p className="mt-2 text-sm text-violet-100/75">
              Print or download this sticker for your shop. The QR sends
              new customers to a guided onboarding — install Phantom, grab
              1 PBTC, walk back in for the discount.
            </p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={printSticker}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-accent px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
              >
                <Printer size={14} />
                Print sticker
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void downloadSvg()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100 hover:bg-white/10"
                >
                  <Download size={12} />
                  SVG
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPng()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100 hover:bg-white/10"
                >
                  <Download size={12} />
                  PNG
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-violet-100/55">
              What the QR does
            </p>
            <ul className="mt-3 space-y-2 text-xs text-violet-100/80">
              <li className="flex gap-2">
                <span className="text-gold-accent">→</span>
                Resolves to{" "}
                <span className="font-mono text-violet-100/95">
                  {qrUrl.replace(origin, "").slice(0, 48) +
                    (qrUrl.length > origin.length + 48 ? "…" : "")}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-gold-accent">→</span>
                Walks new visitors through Phantom install → buy 1 PBTC →
                enter the directory.
              </li>
              {merchantId ? (
                <li className="flex gap-2">
                  <span className="text-gold-accent">→</span>
                  Drops them directly at <strong>{merchantId}</strong>{" "}
                  once they&apos;re verified.
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-xs text-violet-100/70 backdrop-blur-xl">
            <p className="font-semibold text-violet-100">Printing tips</p>
            <ul className="mt-2 space-y-1">
              <li>• 4″×5″ portrait window cling stock looks best.</li>
              <li>• In print dialog, set scaling to <em>Fit to page</em>.</li>
              <li>• Vinyl with adhesive backing &gt; paper for shop windows.</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
