"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Lock,
  Unlock,
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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { fetchWalletBalances, type WalletBalances } from "@/lib/purple-wallet/balances";
import { SendPanel } from "./send-panel";
import { SwapPanel } from "./swap-panel";

type Panel = "none" | "receive" | "send" | "swap";

export function PurpleWalletCard() {
  const wallet = usePurpleWalletContext();
  const { state, address, lock, removeWallet, openModal } = wallet;

  const [panel, setPanel] = useState<Panel>("none");
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);

  const loadBalances = useCallback(async () => {
    if (!address || state !== "unlocked") return;
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const b = await fetchWalletBalances(address);
      setBalances(b);
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
          <Wallet size={14} />
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
            <Wallet size={14} />
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
    <section className="rounded-3xl border border-gold-accent/20 bg-surface p-6 shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-accent">
          <Wallet size={14} />
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

      {/* Balances */}
      {balanceError ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-300">
          <AlertCircle size={12} /> {balanceError}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "SOL", value: balances ? fmt(balances.sol, 4) : "—" },
            { label: "PBTC", value: balances ? fmt(balances.pbtc, 4) : "—" },
            { label: "USDC", value: balances ? fmt(balances.usdc, 2) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
              <p className="mt-1 text-sm font-semibold text-white">{balanceLoading ? "…" : value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-4 gap-2">
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
            onClick={() => setPanel((p) => (p === id ? "none" : id))}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition ${
              panel === id
                ? "border-gold-accent/50 bg-gold-accent/10 text-gold-accent"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"
            }`}
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

      {/* Inline panels */}
      {panel === "receive" && address && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-gold-accent">
            Your address
          </p>
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={address} size={160} />
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

      {panel === "send" && address && (
        <div className="mt-5">
          <SendPanel walletAddress={address} onDone={() => { void loadBalances(); setPanel("none"); }} />
        </div>
      )}

      {panel === "swap" && address && (
        <div className="mt-5">
          <SwapPanel walletAddress={address} balances={balances} onDone={() => { void loadBalances(); setPanel("none"); }} />
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
