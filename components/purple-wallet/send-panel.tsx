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
import { ScanLine } from "lucide-react";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { confirmSignature } from "@/lib/purple-wallet/confirm";
import { QrScanner } from "./qr-scanner";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type Token = "SOL" | "PBTC" | "USDC";
const TOKEN_DECIMALS: Record<Token, number> = { SOL: 9, PBTC: 9, USDC: 6 };

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
  onDone: () => void;
}

export function SendPanel({ walletAddress, onDone }: Props) {
  const { signTransaction, state, openModal } = usePurpleWalletContext();
  const [token, setToken] = useState<Token>("USDC");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

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

      setTxSig(sig);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold">Sent successfully.</p>
        <a
          href={`https://solscan.io/tx/${txSig}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-[11px] text-emerald-300/70 underline"
        >
          {txSig.slice(0, 20)}…
        </a>
        <button type="button" onClick={onDone} className="mt-3 text-xs text-emerald-300/60 hover:text-emerald-200">
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
      <input
        type="number"
        inputMode="decimal"
        placeholder={`Amount (${token})`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-gold-accent/50 focus:outline-none"
      />

      <p className="text-[10px] text-white/30">
        Small SOL fee (~0.000005 SOL) required for every transaction.
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
