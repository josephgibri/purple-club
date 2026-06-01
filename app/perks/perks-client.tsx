"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ShieldCheck, Sparkles } from "lucide-react";
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
      eyebrow="Member Access"
      connectTitle="Sign in to see Perks & Benefits"
      connectDescription="Connect a Solana wallet that holds at least 1 PBTC. Verification is read-only — we never request transactions or transfers. Unlock live promo codes, addresses, and offers from every vetted partner."
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
      <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
              Perks &amp; Benefits
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your Purple Club perks.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-violet-100/75">
              Promo codes, addresses, and live offers — all unlocked. Show your
              pass at any Purple Hub in person.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 sm:inline-flex">
              <ShieldCheck size={14} />
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PBTC
            </span>
            <button
              type="button"
              onClick={() => setIsPassOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110"
            >
              <Sparkles size={14} />
              Open Pass
            </button>
          </div>
        </div>

        <div id="directory">
          <Suspense
            fallback={
              <div className="mt-6 text-sm text-violet-100/70">
                Loading merchant directory…
              </div>
            }
          >
            <MerchantDirectory merchants={directoryMerchants} />
          </Suspense>
        </div>
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
