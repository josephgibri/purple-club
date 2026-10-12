"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ShieldCheck, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

import { ProductGate } from "@/components/access/product-gate";
import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { MerchantDirectory } from "@/components/merchants/merchant-directory";
import { merchants as bundledMerchants, type Merchant } from "@/data/merchants";
import { useMembershipGate } from "@/hooks/useMembershipGate";

/**
 * Perks & Benefits — the token-gated merchant directory (formerly
 * `/directory`). The connect/sign/buy gate is now the shared
 * <ProductGate>; the member experience lives in <PerksDirectory>.
 */
export function PerksClient() {
  return (
    <ProductGate
      eyebrow="Places"
      connectTitle="Sign in to see Places"
      connectDescription="Hold 1 PBTC. Get the member price."
    >
      <PerksDirectory />
    </ProductGate>
  );
}

function PerksDirectory() {
  const { publicKey } = useWallet();
  const { balance, signaturePrefix, signedAtIso } = useMembershipGate();
  const [isPassOpen, setIsPassOpen] = useState(false);
  const [directoryMerchants, setDirectoryMerchants] = useState<Merchant[]>(bundledMerchants);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/public/merchants");
        if (!res.ok) return;
        const data = (await res.json()) as { merchants?: Merchant[] };
        if (cancelled) return;
        // Merge DB-driven listings with the bundled showcase merchants.
        // For each DB row we look for a bundled overlay with the same
        // slug and inherit its CURATORIAL fields — anchor placement,
        // ctaLabel/ctaHref fallback, verification hint. Those aren't
        // merchant-editable in the DB schema, they're editorial picks
        // (e.g. Purple Stay is the flagship anchor). Without this
        // overlay the directory flashes from "Purple Stay as anchor"
        // (bundled initial state) to "Purple Stay as regular card"
        // (DB version) the moment the fetch resolves.
        const dbMerchants = data.merchants ?? [];
        const overlaid = dbMerchants.map<Merchant>((dbItem) => {
          const bundled = bundledMerchants.find((b) => b.id === dbItem.id);
          if (!bundled) return dbItem;
          return {
            ...dbItem,
            isAnchor: dbItem.isAnchor ?? bundled.isAnchor,
            ctaLabel: dbItem.ctaLabel ?? bundled.ctaLabel,
            ctaHref: dbItem.ctaHref ?? bundled.ctaHref,
            verificationHint: dbItem.verificationHint ?? bundled.verificationHint,
          };
        });
        const dbIds = new Set(overlaid.map((m) => m.id));
        const merged = [
          ...overlaid,
          ...bundledMerchants.filter((m) => !dbIds.has(m.id)),
        ];
        if (merged.length > 0) {
          setDirectoryMerchants(merged);
        }
      } catch {
        // Fall back to bundled JSON merchants.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col px-6 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
            Places
          </p>
          <h1 className="club-display mt-2 text-3xl text-[var(--bone)] sm:text-4xl">
            The directory
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--bone-dim)]">
            Show your pass. The business charges the member price. The club never touches the money.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 sm:inline-flex">
            <ShieldCheck size={14} />
            {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PBTC
          </span>
          <Link
            href="/account/business/list"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--bone)]"
          >
            <Store size={14} />
            List a place
          </Link>
          <button
            type="button"
            onClick={() => setIsPassOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--bone)]"
          >
            <Sparkles size={14} />
            Open Pass
          </button>
        </div>
      </div>

      <div id="directory" className="min-w-0">
        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[var(--bone-dim)]">
              Loading merchant directory…
            </div>
          }
        >
          <MerchantDirectory merchants={directoryMerchants} />
        </Suspense>
      </div>

      <DigitalMembershipPass
        isOpen={isPassOpen}
        onClose={() => setIsPassOpen(false)}
        walletAddress={publicKey?.toBase58()}
        pbtcBalance={balance}
        signaturePrefix={signaturePrefix}
        signedAtIso={signedAtIso}
      />
    </main>
  );
}
