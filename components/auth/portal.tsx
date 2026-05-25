"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into a sibling of <body> so they escape any
 * stacking-context-creating ancestor (the sticky TopNav uses
 * `backdrop-filter`, which would otherwise trap a `fixed` overlay
 * inside its containing block and clip it under the header).
 *
 * Mounts only on the client — we render `null` during SSR + the first
 * paint pass to keep React's hydration markup identical, then attach
 * to `document.body` once useEffect runs.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
