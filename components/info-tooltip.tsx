"use client";

import { useEffect, useId, useRef, useState } from "react";

export type InfoTooltipProps = {
  /** Accessible label, also shown as the popover title. */
  label: string;
  /** Tooltip body — string or JSX. */
  children: React.ReactNode;
  /** Optional extra classes on the trigger. */
  className?: string;
};

export function InfoTooltip({ label, children, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (target && wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-white/5 text-[10px] font-semibold leading-none text-white/70 transition hover:border-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EAB308]/60 ${className ?? ""}`}
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pt-glass absolute left-1/2 top-full z-50 mt-2 w-[260px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#0A051A]/95 px-3 py-2 text-left text-[11px] leading-snug text-white/80 shadow-xl backdrop-blur-xl sm:w-[300px]"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FDE68A]">
            {label}
          </span>
          <span className="mt-1 block text-white/75">{children}</span>
        </span>
      ) : null}
    </span>
  );
}
