import Link from "next/link";

import { SURFACE_URLS } from "@/lib/constants";

/**
 * Site-wide footer for the consolidated shell. Carries the product tabs,
 * the "learn" pages (manifesto / investor thesis / partners), and the
 * utility links — including Verify (the public merchant scanner), which
 * moved out of the header.
 */
const COLUMNS: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Club",
    links: [
      { label: "My Account", href: "/account" },
      { label: "Hotels", href: "/stay" },
      { label: "Lend", href: "/lend" },
      { label: "Perks & Benefits", href: "/perks" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { label: "Manifesto", href: "/manifesto" },
      { label: "Investor thesis", href: "/investors" },
      { label: "Become a Partner", href: "/partners" },
      { label: "Partners Login", href: "/join" },
    ],
  },
  {
    heading: "More",
    links: [
      { label: "Verify a pass", href: "/verify" },
      { label: "Burn proof", href: "/burn" },
      { label: "Purple Council", href: SURFACE_URLS.council, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto border-t border-white/10 bg-[#0b0618]/60">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full bg-gold-accent shadow-[0_0_18px_rgba(246,196,83,0.65)]"
              />
              <span className="pc-serif text-lg font-semibold tracking-tight text-white">
                Purple Club
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-violet-100/55">
              Members-only network for PBTC holders. Read-only Solana
              verification — your tokens never leave your wallet.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-accent">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-violet-100/70 transition hover:text-white"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-violet-100/70 transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-white/5 pt-6 text-[11px] text-violet-100/45 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Purple Club</span>
          <span className="uppercase tracking-[0.2em]">
            Hold the asset · Save real money
          </span>
        </div>
      </div>
    </footer>
  );
}
