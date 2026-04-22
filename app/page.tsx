"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { Info, Lock, PenLine, ShoppingBag } from "lucide-react";
import { Suspense, useState } from "react";

import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { MerchantDirectory } from "@/components/merchants/merchant-directory";
import { merchants } from "@/data/merchants";
import { useMembershipGate } from "@/hooks/useMembershipGate";

export default function Home() {
  const { publicKey, connected } = useWallet();
  const {
    balance,
    hasPbtc,
    isVerified,
    isMember,
    isLoading,
    isSigning,
    error,
    authError,
    signaturePrefix,
    signedAtIso,
    verifyOwnership,
  } = useMembershipGate();
  const [isPassOpen, setIsPassOpen] = useState(false);

  const statusLabel = isLoading
    ? "Checking"
    : error
      ? "Error"
      : !connected
        ? "Not Connected"
        : !hasPbtc
          ? "No PBTC"
          : !isVerified
            ? "Ownership Unverified"
            : "Verified";

  const statusDotClass = isLoading
    ? "bg-violet-300 animate-pulse"
    : error
      ? "bg-rose-400"
      : isMember
        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
        : "bg-amber-400";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:py-10">
      <div className="rounded-3xl border border-border bg-surface p-8 shadow-2xl shadow-black/20">
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Member Dashboard
        </h1>
        <p className="mt-3 max-w-xl text-sm text-violet-100/75">
          Connect your wallet to verify that you hold at least 1 PBTC. Access
          remains fully client-side and read-only against Solana RPC.
        </p>
        <Link
          href="/join"
          className="mt-4 inline-flex rounded-lg border border-purple-accent/70 bg-surface-muted px-4 py-2 text-sm text-violet-50 hover:bg-purple-accent/20"
        >
          Own a business? Join the Merchant Network
        </Link>

        <div className="mt-7 inline-flex w-full flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="flex items-center gap-2 text-violet-100/90">
              <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
              {statusLabel}
            </span>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <span className="text-violet-100/90">
              <strong className="font-semibold text-gold-accent">
                {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </strong>{" "}
              <span className="text-violet-100/60">PBTC</span>
            </span>
            <span
              title="Ownership is proven by signing a free, read-only message in your wallet. We never request sign-transaction or transfer permissions, and your PBTC never moves."
              className="inline-flex cursor-help items-center text-violet-100/40 hover:text-violet-100/80"
            >
              <Info size={13} />
            </span>
          </div>
          {isMember ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#directory"
                className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
              >
                <ShoppingBag size={14} />
                Browse Offers
              </a>
              <button
                type="button"
                onClick={() => setIsPassOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
              >
                Open Pass
              </button>
            </div>
          ) : connected && hasPbtc && !isVerified ? (
            <button
              type="button"
              onClick={() => void verifyOwnership()}
              disabled={isSigning}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              <PenLine size={14} />
              {isSigning ? "Waiting for Signature..." : "Verify Ownership"}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-accent px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              <Lock size={14} />
              Buy 1 PBTC to Unlock
            </button>
          )}
        </div>

        {connected && hasPbtc && !isVerified ? (
          <div className="mt-3 rounded-xl border border-gold-accent/30 bg-gold-accent/5 px-4 py-3 text-xs text-violet-100/80">
            <p className="font-semibold text-gold-accent">One more step: prove you own this wallet.</p>
            <p className="mt-1">
              Sign a free message to confirm the connected wallet is yours. This is{" "}
              <strong>not</strong> a transaction and moves no funds.
            </p>
            {authError ? (
              <p className="mt-1 text-rose-300">{authError}</p>
            ) : null}
          </div>
        ) : null}

        <section className="mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">The Protocol</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article
              className="fade-in-up rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
              style={{ animationDelay: "0ms" }}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Step 1</p>
              <h3 className="mt-2 text-lg font-semibold">Acquire PBTC</h3>
              <p className="mt-2 text-sm text-violet-100/80">
                Hold at least 1 PBTC token in your Solana wallet to unlock Purple Club access.
              </p>
            </article>
            <article
              className="fade-in-up rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
              style={{ animationDelay: "150ms" }}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Step 2</p>
              <h3 className="mt-2 text-lg font-semibold">Verify Access</h3>
              <p className="mt-2 text-sm text-violet-100/80">
                Connect your wallet. Our read-only bouncer confirms your PBTC
                balance on-chain in seconds.
              </p>
            </article>
            <article
              className="fade-in-up rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
              style={{ animationDelay: "300ms" }}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-gold-accent">Step 3</p>
              <h3 className="mt-2 text-lg font-semibold">Save & Spend</h3>
              <p className="mt-2 text-sm text-violet-100/80">
                Instantly unlock exclusive rates at global partners and local Purple Hubs.
              </p>
            </article>
          </div>
        </section>

        <div id="directory">
          <Suspense fallback={<div className="mt-6 text-sm text-violet-100/70">Loading merchant directory...</div>}>
            <MerchantDirectory merchants={merchants} locked={!isMember} />
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

      <footer className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-lg font-semibold">Purple Club</p>
            <p className="mt-2 text-sm text-violet-100/80">
              The premier discount network for the PBTC community.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gold-accent">Navigation</p>
            <div className="mt-2 grid gap-2 text-sm">
              <Link href="/#directory" className="text-violet-100/85 hover:text-white">
                Directory
              </Link>
              <Link href="/join" className="text-violet-100/85 hover:text-white">
                Join as Merchant
              </Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gold-accent">Security</p>
            <p className="mt-2 text-sm text-violet-100/80">
              Verification is 100% read-only via Solana RPC. We never request
              Sign Transaction or Transfer permissions. Your PBTC stays safely in your wallet.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
