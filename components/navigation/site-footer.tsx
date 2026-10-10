import Link from "next/link";

/**
 * One hairline, then the line. No product pitch, no rank ladder.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto border-t border-[var(--line)]">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start justify-between gap-2 px-4 py-4 text-[11px] text-[var(--bone-faint)] sm:flex-row sm:items-center">
        <span>Held, not bought.</span>
        <span className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-[var(--bone)]">
            Terms
          </Link>
          <span>@purpleclub · v1</span>
        </span>
      </div>
    </footer>
  );
}
