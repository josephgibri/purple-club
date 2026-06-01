"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  ArrowRight,
  BedDouble,
  ClipboardCheck,
  Crown,
  Gift,
  Landmark,
  Megaphone,
  Plane,
  ShieldCheck,
  Sparkles,
  Store,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductGate } from "@/components/access/product-gate";
import { DigitalMembershipPass } from "@/components/membership/digital-membership-pass";
import { useMembershipGate } from "@/hooks/useMembershipGate";
import { PURPLE_COURT, SOVEREIGN, getRank, isSovereign } from "@/lib/ranks";

/**
 * Member dashboard. The shared <ProductGate> owns the connect/sign/buy
 * flow; members land on their account home: their Purple Court rank,
 * wallet + pass, and quick links into the rest of the club.
 *
 * Travel "bookings" and burn activity arrive here in Phase 2 once the
 * Travel app is ported into `/stay`.
 */
export function AccountClient() {
  return (
    <ProductGate
      eyebrow="My Account"
      connectTitle="Sign in to your account"
      connectDescription="Connect a Solana wallet that holds at least 1 PBTC to see your standing in The Purple Court, open your membership pass, and reach every club surface. Verification is read-only."
    >
      <AccountDashboard />
    </ProductGate>
  );
}

function AccountDashboard() {
  const { publicKey } = useWallet();
  const { balance, signaturePrefix, signedAtIso } = useMembershipGate();
  const [isPassOpen, setIsPassOpen] = useState(false);

  const walletAddress = publicKey?.toBase58();
  const sovereign = isSovereign(walletAddress);
  const rank = getRank(balance, walletAddress);
  const currentTitle = rank.current?.title ?? "Member";
  const currentBlurb = rank.current?.blurb ?? "Welcome to the club.";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col gap-6 px-6 py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
            My Account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back.
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setIsPassOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110"
        >
          <Sparkles size={14} />
          Open Pass
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <PurpleCourtCard
          balance={balance}
          currentTitle={currentTitle}
          currentBlurb={currentBlurb}
          nextTitle={rank.next?.title ?? null}
          nextMin={rank.next?.min ?? null}
          progress={rank.progress}
          sovereign={sovereign}
        />

        <div className="flex flex-col gap-5">
          <WalletCard
            walletAddress={walletAddress}
            balance={balance}
            onOpenPass={() => setIsPassOpen(true)}
          />
          <QuickLinks />
        </div>
      </div>

      <MemberTools />
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

type PurpleCourtCardProps = {
  balance: number;
  currentTitle: string;
  currentBlurb: string;
  nextTitle: string | null;
  nextMin: number | null;
  progress: number;
  sovereign: boolean;
};

function PurpleCourtCard({
  balance,
  currentTitle,
  currentBlurb,
  nextTitle,
  nextMin,
  progress,
  sovereign,
}: PurpleCourtCardProps) {
  const ladder = sovereign ? [...PURPLE_COURT, SOVEREIGN] : PURPLE_COURT;

  return (
    <section className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        <Crown size={14} />
        The Purple Court
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold-accent/40 bg-gradient-to-br from-[#1a0d33] to-[#120925] text-gold-accent">
          <Crown size={28} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-violet-100/55">
            Your rank
          </p>
          <p className="pc-serif text-2xl font-semibold text-white sm:text-3xl">
            {currentTitle}
          </p>
          <p className="mt-0.5 text-sm text-violet-100/70">{currentBlurb}</p>
        </div>
      </div>

      {!sovereign && nextTitle && nextMin != null ? (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-violet-100/70">
            <span>
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PBTC
            </span>
            <span>
              Next: <span className="text-gold-accent">{nextTitle}</span> at{" "}
              {nextMin.toLocaleString()}+
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-accent to-gold-accent transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-gold-accent/30 bg-gold-accent/10 px-4 py-3 text-xs text-gold-accent">
          You sit at the top of the ladder. Long may you reign.
        </p>
      )}

      <ul className="mt-6 divide-y divide-white/5 rounded-2xl border border-white/10 bg-black/20">
        {ladder.map((tier) => {
          const isCurrent = tier.title === currentTitle;
          const reached = sovereign || balance >= tier.min;
          return (
            <li
              key={tier.title}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                isCurrent ? "bg-gold-accent/10" : ""
              }`}
            >
              <span
                className={`flex items-center gap-2 ${
                  reached ? "text-white" : "text-violet-100/45"
                }`}
              >
                {isCurrent ? (
                  <Crown size={13} className="text-gold-accent" />
                ) : (
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      reached ? "bg-gold-accent" : "bg-white/20"
                    }`}
                  />
                )}
                {tier.title}
              </span>
              <span className={reached ? "text-violet-100/70" : "text-violet-100/40"}>
                {tier === SOVEREIGN ? "Founding tier" : `${tier.min.toLocaleString()}+`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-violet-100/45">
        Titles are status only — identity, access, and recognition. They are
        never financial promises: no airdrops, yield, rate boosts, or voting
        rights are tied to a tier. Your rank is private to you.
      </p>
    </section>
  );
}

type WalletCardProps = {
  walletAddress?: string;
  balance: number;
  onOpenPass: () => void;
};

function WalletCard({ walletAddress, balance, onOpenPass }: WalletCardProps) {
  const short = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : "—";

  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        <ShieldCheck size={14} />
        Membership
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-violet-100/60">Wallet</dt>
          <dd className="font-mono text-violet-100/95">{short}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-violet-100/60">PBTC held</dt>
          <dd className="font-mono text-emerald-200">
            {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenPass}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-accent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
        >
          <Sparkles size={14} />
          Open Pass
        </button>
        <Link
          href="/pass"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/85 transition hover:border-white/20 hover:text-white"
        >
          Full-screen pass
          <ArrowRight size={12} />
        </Link>
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
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        Your activity
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ConsoleTile
          href="/stay"
          label="My bookings"
          description="Track hotel requests, offers, payments and vouchers."
          icon={<Plane size={16} />}
        />
        <ConsoleTile
          href="/stay"
          label="Gift Vault"
          description="Gifts you've sent and received across the club."
          icon={<Gift size={16} />}
        />
      </div>
    </section>
  );
}

type SessionState = {
  authenticated?: boolean;
  isAgent?: boolean;
  isFounder?: boolean;
  isPerksAdmin?: boolean;
  isConcierge?: boolean;
  isPromoter?: boolean;
};

/**
 * Role-aware console. One wallet identity unlocks different surfaces; founder
 * wallets are super admins and see everything. Cards only render for the
 * capabilities the connected wallet actually holds.
 */
function RoleConsole() {
  const { publicKey, connected } = useWallet();
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setSession(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/wallet-auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  if (!session?.authenticated) return null;

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

function QuickLinks() {
  const links = [
    { href: "/perks", label: "Perks & Benefits", icon: <Store size={15} /> },
    { href: "/stay", label: "Hotels", icon: <BedDouble size={15} /> },
    { href: "/lend", label: "Lend", icon: <Landmark size={15} /> },
  ];
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
        Explore the club
      </p>
      <div className="mt-4 grid gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-violet-100/85 transition hover:border-gold-accent/40 hover:text-white"
          >
            <span className="flex items-center gap-2">
              {link.icon}
              {link.label}
            </span>
            <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
