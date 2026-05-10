"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { HelpCircle, Info, Lock, Sparkles, Users, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { MerchantDirectory } from "@/components/merchants/merchant-directory";
import { merchants } from "@/data/merchants";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { usePbtcHolders } from "@/hooks/usePbtcHolders";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const JUPITER_BUY_URL = `https://jup.ag/swap/SOL-${PBTC_MINT}`;

export default function Home() {
  const { publicKey, connected } = useWallet();
  const {
    balance,
    hasPbtc,
    isVerified,
    isMember,
    isLoading,
    error,
    authError,
    signaturePrefix,
    signedAtIso,
  } = useMembershipGate();
  const { enter: enterPurpleClub, isPending: isAuthPending, error: authFlowError } =
    useWalletSignIn();
  const [isPassOpen, setIsPassOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [directoryMerchants, setDirectoryMerchants] = useState(merchants);
  const { activeHolders } = usePbtcHolders();

  useEffect(() => {
    let cancelled = false;
    async function loadFromDb() {
      try {
        const res = await fetch("/api/public/merchants");
        if (!res.ok) return;
        const data = (await res.json()) as { merchants?: typeof merchants };
        if (!cancelled && data.merchants && data.merchants.length > 0) {
          setDirectoryMerchants(data.merchants);
        }
      } catch {
        // fallback to bundled JSON merchants
      }
    }
    void loadFromDb();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
          Member Access
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Discounts you only get for holding PBTC.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-violet-100/80">
          Purple Prime is a private discount network for the PBTC community.
          Hold at least <span className="font-semibold text-gold-accent">1 PBTC</span> in your
          Solana wallet to unlock exclusive offers from vetted online and local merchants.
          Verification is read-only — your tokens never leave your wallet.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-violet-100/75">
          {activeHolders !== null ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
              <Users size={12} />
              <strong className="font-mono font-semibold">
                {activeHolders.toLocaleString()}
              </strong>
              <span className="text-emerald-100/80">PBTC holders worldwide</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setIsInfoOpen(true)}
            className="inline-flex items-center gap-1.5 text-violet-100/70 underline-offset-4 hover:text-violet-50 hover:underline"
          >
            <HelpCircle size={12} />
            What is PBTC?
          </button>
        </div>

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
            <button
              type="button"
              onClick={() => setIsPassOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
            >
              <Sparkles size={14} />
              Open Pass
            </button>
          ) : !connected || (connected && !isVerified) ? (
            <button
              type="button"
              onClick={() => void enterPurpleClub()}
              disabled={isAuthPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              <Sparkles size={14} />
              {isAuthPending ? "Connecting…" : "Enter Purple Prime"}
            </button>
          ) : (
            <a
              href={JUPITER_BUY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-accent px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              <Lock size={14} />
              Buy 1 PBTC to Unlock
            </a>
          )}
        </div>

        {connected && isVerified && !hasPbtc ? (
          <div className="mt-3 rounded-xl border border-purple-accent/40 bg-purple-accent/10 px-4 py-3 text-xs text-violet-100/80">
            <p className="font-semibold text-gold-accent">Wallet verified — add PBTC to unlock.</p>
            <p className="mt-1">
              Your ownership signature is good for 24 hours. Hold at least 1 PBTC
              in this wallet to access the Purple Prime directory.
            </p>
          </div>
        ) : null}

        {authError || authFlowError ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {authFlowError ?? authError}
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
                Hold at least 1 PBTC token in your Solana wallet to unlock Purple Prime access.
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
            <MerchantDirectory merchants={directoryMerchants} locked={!isMember} />
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

      {isInfoOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setIsInfoOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-gold-accent/40 bg-[#150a30] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsInfoOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-violet-100/60 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-accent">
              What is PBTC?
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              The Solana token that opens the network.
            </h2>
            <ol className="mt-4 grid gap-3 text-sm text-violet-100/85">
              <li className="flex gap-3">
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
                  1
                </span>
                <span>
                  PBTC is a token on the Solana blockchain. Hold at least 1 PBTC and you&apos;re a Purple Prime member.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
                  2
                </span>
                <span>
                  Connect a Solana wallet (Phantom, Solflare, etc.) and sign a free read-only message. We never request transaction or transfer permissions.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-accent text-[11px] font-bold text-black">
                  3
                </span>
                <span>
                  The full directory of merchants and their promo codes unlocks. Use them online or in person — your tokens stay safely in your wallet.
                </span>
              </li>
            </ol>
            <a
              href={JUPITER_BUY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black hover:brightness-110"
            >
              Buy PBTC on Jupiter
            </a>
          </div>
        </div>
      ) : null}

      <footer className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-lg font-semibold">Purple Prime</p>
            <p className="mt-2 text-sm text-violet-100/80">
              The premier discount network for the PBTC community.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gold-accent">Navigation</p>
            <div className="mt-2 grid gap-2 text-sm">
              <Link href="/#directory" className="text-violet-100/85 hover:text-white">
                Browse merchants
              </Link>
              <Link href="/join" className="text-violet-100/85 hover:text-white">
                For Merchants
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
