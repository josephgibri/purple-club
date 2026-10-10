"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  ArrowRight,
  BedDouble,
  ClipboardCheck,
  Gift,
  Megaphone,
  Plane,
  ShieldCheck,
  Sparkles,
  Store,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProductGate } from "@/components/access/product-gate";
import { CommunityCard } from "@/components/telegram/community-card";
import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { PurpleWalletCard } from "@/components/purple-wallet/wallet-card";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { PURPLE_WALLET_ENABLED } from "@/lib/purple-wallet/feature-flag";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { useWalletSession } from "@/hooks/useWalletSession";
import { JUPITER_SWAP_URL } from "@/lib/constants";
import { DOG_TITLE, QUESTS } from "@/lib/quests";

/**
 * Member dashboard. The shared <ProductGate> owns the connect/sign/buy
 * flow; members land on You: the club key, four quests, and the wallet.
 *
 * Travel "bookings" and burn activity arrive here in Phase 2 once the
 * Travel app is ported into `/stay`.
 */
export function AccountClient() {
  return (
    <ProductGate
      eyebrow="My Account"
      connectTitle="Sign in to your account"
      connectDescription="Connect a Solana wallet. Verification is read-only — your tokens never leave your wallet."
      unlockOnVerified
    >
      <AccountDashboard />
    </ProductGate>
  );
}

function AccountDashboard() {
  const { publicKey } = useWallet();
  const { balance, hasPbtc, signaturePrefix, signedAtIso } = useMembershipGate();
  const purple = usePurpleWalletContext();
  const [isPassOpen, setIsPassOpen] = useState(false);

  const walletAddress = publicKey?.toBase58();

  // The built-in Purple Wallet card is shown ONLY when the user is actually
  // signed in with the Purple Wallet (its address matches the session). A
  // Purple Wallet may exist in this browser from a previous session, but if the
  // user logged in with a different wallet (Phantom/Solflare) it belongs to a
  // different identity and must not surface in their profile — it only appears
  // when they log in with it.
  const loggedInWithPurple =
    !!walletAddress && !!purple.address && purple.address === walletAddress;
  const showPurpleCard = PURPLE_WALLET_ENABLED && loggedInWithPurple;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col gap-6 px-6 py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
            You
          </p>
          <h1 className="club-display mt-2 text-3xl text-[var(--bone)] sm:text-4xl">
            Your key
          </h1>
        </div>
      </header>

      <CommunityCard />

      {!hasPbtc ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-accent/30 bg-gold-accent/10 px-5 py-3.5">
          <p className="text-sm text-gold-accent">
            You&apos;re signed in. Hold at least 1 PBTC. That is the club key.
          </p>
          <a
            href={JUPITER_SWAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
          >
            Buy PBTC
          </a>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <KeyAndQuests held={hasPbtc} />
        <div className="flex h-full flex-col gap-5">
          <WalletCard
            walletAddress={walletAddress}
            balance={balance}
            onOpenPass={() => setIsPassOpen(true)}
            showDetails={!loggedInWithPurple}
          />
          {showPurpleCard ? <PurpleWalletCard /> : null}
          <div className="flex min-h-0 flex-1 flex-col">
            <MemberTools />
          </div>
        </div>
      </div>

      <RoleConsole />

      <DigitalMembershipPass
        isOpen={isPassOpen}
        onClose={() => setIsPassOpen(false)}
        walletAddress={walletAddress}
        pbtcBalance={balance}
        signaturePrefix={signaturePrefix}
        signedAtIso={signedAtIso}
      />
    </main>
  );
}

function KeyAndQuests({ held }: { held: boolean }) {
  return (
    <section className="flex h-full flex-col rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
        Club key
      </p>
      <p className="mt-2 text-sm text-[var(--bone)]">
        {held ? "Held. 1 PBTC." : "Not held. 1 PBTC opens the club."}
      </p>

      <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
        Quests
      </p>
      <ul className="mt-2 divide-y divide-[var(--line)]">
        {QUESTS.map((quest) => (
          <li key={quest.id} className="flex items-baseline justify-between gap-4 py-3">
            <span>
              <span className="text-sm text-[var(--bone)]">{quest.title}</span>
              <span className="mt-0.5 block text-xs text-[var(--bone-dim)]">{quest.detail}</span>
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[var(--bone-faint)]">
              Not done
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-4 text-xs text-[var(--bone-dim)]">
        All four unlock <span className="text-[var(--ink)]">{DOG_TITLE}</span>. A title
        unlocks nothing but the title.
      </p>
    </section>
  );
}

type WalletCardProps = {
  walletAddress?: string;
  balance: number;
  onOpenPass: () => void;
  /**
   * When false, the wallet address + PBTC rows are hidden. Used when the user
   * signed in with the built-in Purple Wallet — its own card already shows the
   * address and balances, so the Membership card collapses to just the Pass.
   */
  showDetails?: boolean;
};

function WalletCard({ walletAddress, balance, onOpenPass, showDetails = true }: WalletCardProps) {
  const short = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : "—";

  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        <ShieldCheck size={14} />
        Membership
      </div>
      {showDetails ? (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-violet-100/60">Wallet</span>
            <span className="font-mono text-violet-100/95">{short}</span>
          </div>
          <AccountEmail />
          <div className="flex items-center justify-between">
            <span className="text-violet-100/60">PBTC held</span>
            <span className="font-mono text-emerald-200">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs text-violet-100/60">
            Your membership pass — wallet details are in your Purple Wallet below.
          </p>
          <AccountEmail />
        </>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenPass}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-accent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
        >
          <Sparkles size={14} />
          Open Pass
        </button>
      </div>
    </section>
  );
}

type TileProps = {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent?: boolean;
};

function ConsoleTile({ href, label, description, icon, accent }: TileProps) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition ${
        accent
          ? "border-gold-accent/40 bg-gold-accent/10 hover:border-gold-accent/70"
          : "border-white/10 bg-white/5 hover:border-white/25"
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          accent ? "bg-gold-accent/20 text-gold-accent" : "bg-white/10 text-violet-100/85"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
          {label}
          <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block text-xs text-violet-100/60">{description}</span>
      </span>
    </Link>
  );
}

/** Always-available member surfaces: bookings + the gift vault live in /stay. */
function MemberTools() {
  return (
    <section className="flex h-full flex-col rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        Your activity
      </p>
      <div className="mt-4 grid gap-3">
        <ConsoleTile
          href="/account/business"
          label="Business"
          description="List a place, or check a member's pass."
          icon={<Store size={16} />}
        />
        <ConsoleTile
          href="/account/bookings"
          label="My bookings"
          description="Track hotel requests, offers, payments and vouchers."
          icon={<Plane size={16} />}
        />
      </div>
    </section>
  );
}

/**
 * Contact email on the wallet card. Empty until saved, then a row like the
 * wallet line. A stay booking waits until the address is verified.
 */
function AccountEmail() {
  const session = useWalletSession();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  const email = savedEmail ?? session.email ?? "";
  const isVerified = verified ?? Boolean(session.emailVerified);

  async function save(next: string) {
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/wallet-auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: string | null;
        verified?: boolean;
        sent?: boolean;
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not save your email.");
        return;
      }
      setStatus("idle");
      setSavedEmail(data.email ?? next.trim());
      setVerified(Boolean(data.verified));
      setLinkSent(Boolean(data.sent));
      setEditing(false);
      if (data.email && !data.verified && !data.sent) {
        setMessage("Could not send the verification email.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not save your email.");
    }
  }

  if (email && !editing) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-violet-100/60">Email</span>
          <span className="truncate font-mono text-violet-100/95" title={email}>
            {email}
          </span>
        </div>
        {!isVerified ? (
          <p className="mt-2 text-xs text-violet-100/55">
            {linkSent ? "Check your inbox to verify it." : "Verify it before a stay."}{" "}
            <button
              type="button"
              onClick={() => void save(email)}
              disabled={status === "saving"}
              className="uppercase tracking-[0.12em] text-[var(--ink)] disabled:opacity-50"
            >
              {status === "saving" ? "Sending…" : linkSent ? "Resend" : "Send link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(email);
                setEditing(true);
                setMessage("");
              }}
              className="ml-3 uppercase tracking-[0.12em] text-violet-100/45"
            >
              Change
            </button>
          </p>
        ) : null}
        {message ? <p className="mt-2 text-xs text-red-300">{message}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="name@email.com"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-violet-100/40 focus:border-gold-accent/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void save(value)}
          disabled={status === "saving"}
          className="shrink-0 rounded-xl bg-gold-accent px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "…" : "Save"}
        </button>
      </div>
      {message ? (
        <p className={`mt-2 text-xs ${status === "error" ? "text-red-300" : "text-violet-100/55"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Role-aware console. One wallet identity unlocks different surfaces; founder
 * wallets are super admins and see everything. Cards only render for the
 * capabilities the connected wallet actually holds.
 *
 * Sources the server session via the shared hook, which polls a few times so
 * the console appears right after sign-in (the `pc_session` cookie is minted
 * a beat after the SIWS proof) without a manual refresh.
 */
function RoleConsole() {
  const session = useWalletSession();

  if (!session.authenticated) return null;

  const showConcierge = session.isConcierge || session.isAgent || session.isFounder;
  const showPerks = session.isPerksAdmin || session.isFounder;
  const showPromoter = session.isPromoter || session.isFounder;
  const showFounder = session.isFounder;

  if (!showConcierge && !showPerks && !showPromoter) return null;

  return (
    <section className="rounded-3xl border border-gold-accent/25 bg-surface p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        <Wrench size={14} />
        Operator console
        {showFounder ? (
          <span className="rounded-full border border-gold-accent/40 bg-gold-accent/10 px-2 py-0.5 text-[10px] tracking-[0.18em] text-gold-accent">
            Founder · super admin
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {showConcierge ? (
          <ConsoleTile
            href="/admin/travel"
            label="Concierge desk"
            description="Manage hotel requests, offers, payments and vouchers."
            icon={<BedDouble size={16} />}
            accent
          />
        ) : null}
        {showPerks ? (
          <ConsoleTile
            href="/admin/reviews"
            label="Perks review queue"
            description="Approve, edit or send back merchant listings."
            icon={<ClipboardCheck size={16} />}
            accent
          />
        ) : null}
        {showPromoter ? (
          <ConsoleTile
            href="/promoter"
            label="Promoter portal"
            description="Mint and track invite codes for your campaigns."
            icon={<Megaphone size={16} />}
          />
        ) : null}
        {showFounder ? (
          <>
            <ConsoleTile
              href="/admin/travel/campaigns"
              label="Campaigns"
              description="Create and manage influencer campaigns."
              icon={<Megaphone size={16} />}
            />
            <ConsoleTile
              href="/admin/travel/burns"
              label="Burn ledger"
              description="Record and publish PBTC burn events."
              icon={<Sparkles size={16} />}
            />
            <ConsoleTile
              href="/admin/travel/gifts"
              label="Gifts admin"
              description="Oversee gift claims and fulfillment."
              icon={<Gift size={16} />}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
