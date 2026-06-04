"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  Lock,
  Copy,
  Check,
  Send,
  Download,
  ArrowLeftRight,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  KeyRound,
  AlertTriangle,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Portal } from "@/components/auth/portal";

/** Purple Bitcoin glyph used as the Purple Wallet mark. */
function PurpleMark({ size = 16 }: { size?: number }) {
  return (
    <Image
      src="/purple-club-icon.svg"
      alt=""
      width={size}
      height={size}
      className="rounded-[4px]"
    />
  );
}
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { fetchWalletBalances, type WalletBalances } from "@/lib/purple-wallet/balances";
import { fetchTokenPricesUsd, formatUsd, type TokenPricesUsd } from "@/lib/purple-wallet/prices";
import { SendPanel } from "./send-panel";
import { SwapPanel } from "./swap-panel";
import { TOKEN_ICONS } from "./token-select";

const ASSET_NAMES = { SOL: "Solana", PBTC: "Purple Bitcoin", USDC: "USD Coin" } as const;

type Panel = "none" | "receive" | "send" | "swap";

const PANEL_TITLES: Record<Exclude<Panel, "none">, string> = {
  receive: "Receive",
  send: "Send",
  swap: "Swap",
};

/** Centered modal shell for the wallet's Send / Receive / Swap actions. */
function WalletActionModal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-gold-accent/25 bg-[#0d0720] p-5 shadow-2xl shadow-black/60 sm:p-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
              {icon}
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

export function PurpleWalletCard() {
  const wallet = usePurpleWalletContext();
  const { state, address, lock, removeWallet, openModal, revealPhrase } = wallet;

  const [panel, setPanel] = useState<Panel>("none");
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [prices, setPrices] = useState<TokenPricesUsd | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);

  // Reveal-recovery-phrase flow (password-gated).
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealedPhrase, setRevealedPhrase] = useState("");
  const [revealError, setRevealError] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);

  function closeReveal() {
    setRevealOpen(false);
    setRevealPassword("");
    setRevealedPhrase("");
    setRevealError("");
  }

  async function handleReveal() {
    setRevealError("");
    setRevealing(true);
    try {
      const phrase = await revealPhrase(revealPassword);
      setRevealedPhrase(phrase);
      setRevealPassword("");
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "Could not reveal phrase.");
    } finally {
      setRevealing(false);
    }
  }

  const loadBalances = useCallback(async () => {
    if (!address || state !== "unlocked") return;
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const [b, p] = await Promise.all([
        fetchWalletBalances(address),
        fetchTokenPricesUsd().catch(() => null),
      ]);
      setBalances(b);
      if (p) setPrices(p);
    } catch {
      setBalanceError("Could not load balances.");
    } finally {
      setBalanceLoading(false);
    }
  }, [address, state]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  function copyAddress() {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shortAddress(addr: string) {
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  }

  function fmt(n: number, decimals = 4) {
    return hideBalances ? "••••" : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  }

  function fmtUsd(n: number) {
    return hideBalances ? "••••" : formatUsd(n);
  }

  const assetUsd = balances && prices
    ? {
        sol: balances.sol * prices.sol,
        pbtc: balances.pbtc * prices.pbtc,
        usdc: balances.usdc * prices.usdc,
      }
    : null;
  const totalUsd = assetUsd ? assetUsd.sol + assetUsd.pbtc + assetUsd.usdc : null;

  async function handleDelete() {
    await removeWallet();
    setShowDeleteConfirm(false);
    setPanel("none");
    setBalances(null);
  }

  // ── State: no wallet ────────────────────────────────────────────────────
  if (state === "none") {
    return (
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
          <PurpleMark size={16} />
          Purple Wallet
        </div>
        <p className="mt-2 text-xs text-violet-100/60">
          A non-custodial wallet built into Purple Club. Your keys stay in your browser.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => openModal("create")}
            className="flex-1 rounded-xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Create wallet
          </button>
          <button
            type="button"
            onClick={() => openModal("import")}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/25"
          >
            Import seed phrase
          </button>
        </div>
      </section>
    );
  }

  // ── State: locked ───────────────────────────────────────────────────────
  if (state === "locked") {
    return (
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
            <PurpleMark size={16} />
            Purple Wallet
          </div>
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/50">
            <Lock size={10} />
            Locked
          </span>
        </div>
        {address && (
          <p className="mt-3 font-mono text-xs text-violet-100/50">{shortAddress(address)}</p>
        )}
        <button
          type="button"
          onClick={() => openModal("unlock")}
          className="mt-4 w-full rounded-xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Unlock wallet
        </button>
      </section>
    );
  }

  // ── State: unlocked ─────────────────────────────────────────────────────
  return (
    <section className="flex h-full flex-col rounded-3xl border border-gold-accent/20 bg-surface p-6 shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
          <PurpleMark size={16} />
          Purple Wallet
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideBalances((h) => !h)}
            className="text-white/35 hover:text-white/70"
            title={hideBalances ? "Show balances" : "Hide balances"}
          >
            {hideBalances ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => void loadBalances()}
            disabled={balanceLoading}
            className="text-white/35 hover:text-white/70 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={balanceLoading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={lock}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/60 hover:text-white/90"
          >
            <Lock size={10} />
            Lock
          </button>
        </div>
      </div>

      {/* Address */}
      {address && (
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-xs text-violet-100/50">{shortAddress(address)}</span>
          <button type="button" onClick={copyAddress} className="text-white/30 hover:text-white/70">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
        </div>
      )}

      {/* Total portfolio value */}
      <div className="mt-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
          Total value
        </p>
        <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
          {balanceLoading && totalUsd === null
            ? "…"
            : totalUsd !== null
              ? fmtUsd(totalUsd)
              : "—"}
        </p>
      </div>

      {/* Action buttons */}
      <div className="mt-6 grid grid-cols-4 gap-2">
        {(
          [
            { id: "send", label: "Send", Icon: Send },
            { id: "receive", label: "Receive", Icon: Download },
            { id: "swap", label: "Swap", Icon: ArrowLeftRight },
          ] as { id: Panel; label: string; Icon: typeof Send }[]
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/70 transition hover:border-white/20"
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-red-400/70 transition hover:border-red-500/30 hover:text-red-400"
        >
          <Trash2 size={15} />
          Delete
        </button>
      </div>

      {/* Assets — square tiles with the token icon */}
      {balanceError ? (
        <div className="mt-5 flex items-center gap-2 text-xs text-red-300">
          <AlertCircle size={12} /> {balanceError}
        </div>
      ) : (
        <div className="mt-6">
          <p className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/35">
            Assets
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {(
              [
                { sym: "SOL", amount: balances?.sol, usd: assetUsd?.sol, dec: 4 },
                { sym: "PBTC", amount: balances?.pbtc, usd: assetUsd?.pbtc, dec: 4 },
                { sym: "USDC", amount: balances?.usdc, usd: assetUsd?.usdc, dec: 2 },
              ] as const
            ).map(({ sym, amount, usd, dec }) => (
              <div
                key={sym}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-2 py-4 text-center"
                title={ASSET_NAMES[sym]}
              >
                <Image
                  src={TOKEN_ICONS[sym]}
                  alt=""
                  width={38}
                  height={38}
                  className="h-[38px] w-[38px] rounded-full"
                />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{sym}</p>
                <p className="text-sm font-semibold leading-tight text-white">
                  {balanceLoading && amount === undefined ? "…" : amount !== undefined ? fmt(amount, dec) : "—"}
                </p>
                <p className="text-[10px] text-white/40">{usd !== undefined ? fmtUsd(usd) : "—"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Send / Receive / Swap modal */}
      {panel !== "none" && address && (
        <WalletActionModal
          title={PANEL_TITLES[panel]}
          icon={
            panel === "send" ? (
              <Send size={14} />
            ) : panel === "receive" ? (
              <Download size={14} />
            ) : (
              <ArrowLeftRight size={14} />
            )
          }
          onClose={() => setPanel("none")}
        >
          {panel === "receive" && (
            <div>
              <div className="flex justify-center">
                <div className="rounded-2xl bg-white p-3">
                  <QRCodeSVG value={address} size={180} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="break-all font-mono text-[11px] text-violet-100/70">{address}</span>
                <button type="button" onClick={copyAddress} className="shrink-0 text-white/40 hover:text-white/80">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="mt-3 text-center text-[10px] text-white/35">
                Send only Solana (SOL) and SPL tokens to this address.
              </p>
            </div>
          )}

          {panel === "send" && (
            <SendPanel walletAddress={address} onDone={() => { void loadBalances(); setPanel("none"); }} />
          )}

          {panel === "swap" && (
            <SwapPanel walletAddress={address} balances={balances} onDone={() => { void loadBalances(); setPanel("none"); }} />
          )}
        </WalletActionModal>
      )}

      {/* Reveal recovery phrase */}
      {!revealOpen ? (
        <button
          type="button"
          onClick={() => setRevealOpen(true)}
          className="mt-auto flex w-full items-center justify-center gap-1.5 pt-5 text-[11px] font-semibold text-white/40 transition hover:text-white/70"
        >
          <KeyRound size={12} />
          Reveal recovery phrase
        </button>
      ) : (
        <div className="mt-auto pt-5 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
          {revealedPhrase ? (
            <>
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle size={14} />
                <p className="text-xs font-semibold">Never share these words</p>
              </div>
              <p className="mt-1 text-[11px] text-amber-100/70">
                Anyone with your phrase can take your funds. Make sure no one is watching.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {revealedPhrase.split(" ").map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                    <span className="w-4 text-right text-[10px] text-white/40">{i + 1}.</span>
                    <span className="font-mono text-xs text-white">{word}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(revealedPhrase);
                    setPhraseCopied(true);
                    setTimeout(() => setPhraseCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-violet-100/55 hover:text-violet-100/85"
                >
                  <Copy size={12} />
                  {phraseCopied ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={closeReveal}
                  className="rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                >
                  Hide
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-white">Enter your password</p>
              <p className="mt-1 text-[11px] text-white/50">
                Confirm your password to reveal your 12-word recovery phrase.
              </p>
              <input
                type="password"
                autoComplete="current-password"
                value={revealPassword}
                onChange={(e) => setRevealPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleReveal(); }}
                placeholder="Password"
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-gold-accent/60 focus:outline-none"
              />
              {revealError && <p className="mt-2 text-[11px] text-red-300">{revealError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={closeReveal}
                  className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:border-white/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleReveal()}
                  disabled={revealing || !revealPassword}
                  className="flex-1 rounded-xl bg-gold-accent px-3 py-2 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50"
                >
                  {revealing ? "Revealing…" : "Reveal"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-200">Delete this wallet?</p>
          <p className="mt-1 text-xs text-red-200/70">
            This removes the encrypted key from this browser. You can restore it anytime with your seed phrase.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:border-white/30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
