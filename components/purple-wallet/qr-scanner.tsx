"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, CameraOff } from "lucide-react";
import { Portal } from "@/components/auth/portal";

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * Camera QR scanner for the Send flow. Streams the rear camera, decodes each
 * frame with jsQR, and returns the first QR payload found. Used to fill a
 * recipient address by scanning the receiver's QR (handles both a bare
 * address and a `solana:<address>` URI).
 */
export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError(
          "Couldn't access the camera. Allow camera permission, or paste the address instead.",
        );
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
      if (code && code.data) {
        // Strip a `solana:` URI prefix and any query string → bare address.
        const raw = code.data.trim().replace(/^solana:/i, "");
        const address = raw.split(/[?&]/)[0];
        onResult(address);
        return; // stop scanning; cleanup runs on unmount
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#0A051A] p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full bg-black/40 p-1 text-white/70 hover:text-white"
            aria-label="Close scanner"
          >
            <X size={18} />
          </button>
          <p className="mb-3 text-sm font-semibold text-white">Scan recipient QR</p>

          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CameraOff size={28} className="text-white/40" />
              <p className="px-4 text-xs text-violet-100/70">{error}</p>
            </div>
          ) : (
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-gold-accent/70" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
          <p className="mt-3 text-center text-[11px] text-white/40">
            Point your camera at a Solana wallet QR code.
          </p>
        </div>
      </div>
    </Portal>
  );
}
