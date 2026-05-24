"use client";

import jsQR from "jsqr";
import { Camera, CameraOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type CameraScannerProps = {
  onResult: (text: string) => void;
  isActive: boolean;
};

/**
 * Minimal QR scanner that works on any modern phone browser without an
 * install. Uses `getUserMedia` to stream the rear camera into an
 * off-screen `<canvas>`, then runs `jsQR` ~10 frames/sec to decode.
 *
 * Why jsQR and not the native BarcodeDetector API: BarcodeDetector is
 * still missing on iOS Safari (where most cash-counter scans happen) as
 * of mid-2026. jsQR is ~50KB gzipped, pure JS, and works everywhere
 * `getUserMedia` does.
 *
 * Stops the stream when `isActive` flips false (e.g. when the verifier
 * has a result on screen) so the camera light goes off and the user
 * isn't burning battery decoding while reading the result.
 */
export function CameraScanner({ onResult, isActive }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDecodeRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // The `onResult` callback can change on every parent re-render (the
  // verifier swaps it via useCallback). We pin the latest value in a ref
  // so the tick loop below is itself stable — otherwise re-creating
  // `tick` mid-decode would tear down and restart the camera stream.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stop();
      return;
    }

    let cancelled = false;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      // ~10 decode attempts per second is plenty for QR codes and keeps
      // mobile CPUs cool.
      if (now - lastDecodeRef.current < 100) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDecodeRef.current = now;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const result = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
      if (result?.data) {
        onResultRef.current(result.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("This browser doesn't support camera access.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
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
        video.setAttribute("playsinline", "true");
        await video.play();
        setIsStreaming(true);
        rafRef.current = requestAnimationFrame(tick);
      } catch (value) {
        if (cancelled) return;
        const msg =
          value instanceof Error && value.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access and try again."
            : value instanceof Error
              ? value.message
              : "Could not start camera.";
        setError(msg);
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [isActive, stop]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-400/30 bg-black">
      <video
        ref={videoRef}
        className="block aspect-square w-full bg-black object-cover"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
        <div className="absolute left-1/2 top-1/2 h-3/5 w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-emerald-300/70 shadow-[0_0_40px_-10px_rgba(110,231,183,0.5)]" />
        <div className="absolute left-0 right-0 top-3 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100 backdrop-blur-md">
            {isStreaming ? <Camera size={11} /> : <CameraOff size={11} />}
            {isStreaming ? "Scanning…" : "Starting camera"}
          </span>
        </div>
      </div>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
