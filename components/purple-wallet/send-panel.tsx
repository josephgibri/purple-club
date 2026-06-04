"use client";

import { useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import Image from "next/image";
import { ScanLine, CheckCircle2, ExternalLink } from "lucide-react";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { confirmSignature } from "@/lib/purple-wallet/confirm";
import type { WalletBalances } from "@/lib/purple-wallet/balances";
import { QrScanner } from "./qr-scanner";
import { TOKEN_ICONS } from "./token-select";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type Token = "SOL" | "PBTC" | "USDC";
const TOKEN_DECIMALS: Record<Token, number> = { SOL: 9, PBTC: 9, USDC: 6 };

// Leave a little SOL behind on a "Max" SOL send to cover the network fee.
const SOL_FEE_RESERVE = 0.001;

function getConnection() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return new Connection(`${origin}/api/rpc`, "confirmed");
}

function getMint(token: Token): string {
  if (token === "SOL") return "";
  if (token === "PBTC") return PBTC_MINT;
  return process.env.NEXT_PUBLIC_USDC_MINT?.trim() || DEFAULT_USDC_MINT;
}

interface Props {
  walletAddress: string;
  balances: WalletBalances | null;
  onDone: () => void;
}

export function SendPanel({ walletAddress, balances, onDone }: Props) {
  const { signTransaction, state, openModal } = usePurpleWalletContext();
  const [token, setToken] = useState<Token>("USDC");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [txSig, setTxSig] = useState("");
  const [summary, setSummary] = useState<{ amount: string; token: Token; recipient: string } | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  const available = balances ? balances[token.toLowerCase() as keyof WalletBalances] : null;
  // Sending all your SOL would leave nothing for the network fee, so reserve a bit.
  const maxSendable =
    available === null ? 0 : token === "SOL" ? Math.max(0, available - SOL_FEE_RESERVE) : available;
  const fmtAmount = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: token === "USDC" ? 2 : 6 });

  async function handleSend() {
    setError("");
    if (!recipient || !amount) { setError("Fill in all fields."); return; }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient.trim());
    } catch {
      setError("Invalid recipient address."); return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { setError("Enter a valid amount."); return; }

    if (state !== "unlocked") {
      openModal("unlock");
      return;
    }

    setStatus("sending");
    try {
      const connection = getConnection();
      const sender = new PublicKey(walletAddress);
      const tx = new Transaction();

      if (token === "SOL") {
        const lamports = Math.round(amountNum * LAMPORTS_PER_SOL);
        tx.add(
          SystemProgram.transfer({ fromPubkey: sender, toPubkey: recipientPubkey, lamports }),
        );
      } else {
        const mintPubkey = new PublicKey(getMint(token));
        const decimals = TOKEN_DECIMALS[token];
        const rawAmount = BigInt(Math.round(amountNum * 10 ** decimals));

        const senderAta = getAssociatedTokenAddressSync(mintPubkey, sender);
        const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(sender, recipientAta, recipientPubkey, mintPubkey),
          createTransferCheckedInstruction(senderAta, mintPubkey, recipientAta, sender, rawAmount, decimals),
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = sender;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      // Confirm by polling over HTTP — the /api/rpc proxy has no websocket,
      // so connection.confirmTransaction() would hang forever.
      await confirmSignature(connection, sig);

      setSummary({ amount, token, recipient: recipient.trim() });
      setTxSig(sig);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
      setStatus("error");
    }
  }

  if (status === "done") {
    const shortRecipient = summary
      ? `${summary.recipient.slice(0, 4)}…${summary.recipient.slice(-4)}`
      : "";
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <CheckCircle2 size={26} />
          </span>
          <p className="text-base font-semibold text-white">Sent successfully</p>
          <p className="text-xs text-white/45">Your balance will update shortly.</p>
        </div>

        {summary && (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Image src={TOKEN_ICONS[summary.token]} alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
                <span className="text-[10px] uppercase tracking-widest text-white/40">Sent</span>
              </span>
              <span className="text-sm font-semibold text-white">
                {summary.amount} {summary.token}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-2">
              <span className="text-[10px] uppercase tracking-widest text-white/40">To</span>
              <span className="font-mono text-xs text-white/75">{shortRecipient}</span>
            </div>
          </div>
        )}

        <a
          href={`https://solscan.io/tx/${txSig}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200/70 transition hover:text-violet-100"
        >
          View on Solscan
          <ExternalLink size={12} />
        </a>

        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-gold-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["SOL", "PBTC", "USDC"] as Token[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setToken(t)}
            className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
              token === t
                ? "border-gold-accent/50 bg-gold-accent/10 text-gold-accent"
                : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Recipient address"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-4 pr-11 font-mono text-xs text-white placeholder:text-white/35 focus:border-gold-accent/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-gold-accent"
          aria-label="Scan QR code"
          title="Scan QR code"
        >
          <ScanLine size={16} />
        </button>
      </div>

      {scanning ? (
        <QrScanner
          onResult={(text) => {
            setRecipient(text);
            setScanning(false);
            setError("");
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Amount
          </span>
          <span className="text-[11px] text-white/45">
            Available:{" "}
            <span className="font-medium text-white/75">
              {available !== null ? fmtAmount(available) : "—"}
            </span>{" "}
            {token}
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-4 pr-16 text-sm text-white placeholder:text-white/35 focus:border-gold-accent/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setAmount(String(maxSendable))}
            disabled={available === null || maxSendable <= 0}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gold-accent/40 bg-gold-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-accent transition hover:bg-gold-accent/20 disabled:opacity-40"
          >
            Max
          </button>
        </div>
      </div>

      <p className="text-[10px] text-white/30">
        {token === "SOL"
          ? "Max leaves ~0.001 SOL for network fees."
          : "Small SOL fee (~0.000005 SOL) required for every transaction."}
      </p>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:border-white/25"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={status === "sending"}
          className="flex-1 rounded-xl bg-gold-accent px-3 py-2 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
