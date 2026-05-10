"use client";

import { useId, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  kind: "logo" | "hero";
  hint?: string;
  aspect?: "square" | "wide";
};

const MAX_BYTES = 4 * 1024 * 1024;

export function ImageUploadField({ label, value, onChange, kind, hint, aspect = "square" }: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`Image is too large. Max ${MAX_BYTES / 1024 / 1024}MB.`);
      return;
    }
    const data = new FormData();
    data.set("file", file);
    data.set("kind", kind);
    setUploading(true);
    try {
      const res = await fetch("/api/uploads/listing-image", { method: "POST", body: data });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      onChange(json.url);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const previewClass =
    aspect === "wide"
      ? "aspect-[16/9] w-full"
      : "h-24 w-24";

  return (
    <div className="grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-violet-100/85">
          {label}
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-gold-accent/60 bg-gold-accent/10 px-3 py-1.5 text-xs font-semibold text-gold-accent disabled:opacity-60"
        >
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
      </div>
      <input
        id={inputId}
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-start gap-3">
        <div
          className={`overflow-hidden rounded-xl border border-border bg-surface-muted ${previewClass}`}
        >
          {value ? (
            // Plain img: dashboard-only preview, not optimized.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.2";
              }}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] uppercase tracking-widest text-violet-100/40">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… (or use Upload)"
            className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs"
          />
          {hint ? <p className="text-[11px] text-violet-100/55">{hint}</p> : null}
          {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
