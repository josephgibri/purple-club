"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import { confirmSignature } from "@/lib/purple-wallet/confirm";
import {
  getSwapQuote,
  buildSwapTransaction,
  formatTokenAmount,
  TOKEN_MINTS,
  TOKEN_DECIMALS,
  PURPLE_FEE_BPS,
  type TokenSymbol,
  type QuoteResponse,
} from "@/lib/purple-wallet/jupiter";
import type { WalletBalances } from "@/lib/purple-wallet/balances";
import { TokenSelect, TOKEN_ICONS } from "./token-select";

interface SwapSummary {
  inAmount: string;
  inToken: TokenSymbol;
  outAmount: string;
  outToken: TokenSymbol;
}

const TOKENS: TokenSymbol[] = ["SOL", "PBTC", "USDC"];

function getConnection() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return new Connection(`${origin}/api/rpc`, "confirmed");
}

interface Props {
  walletAddress: string;
  balances: WalletBalances | null;
  onDone: () => void;
}

export function SwapPanel({ walletAddress, balances, onDone }: Props) {
  const { signTransaction, state, openModal } = usePurpleWalletContext();

  const [inputToken, setInputToken] = useState<TokenSymbol>("USDC");
  const [outputToken, setOutputToken] = useState<TokenSymbol>("PBTC");
  const [inputAmount, setInputAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [status, setStatus] = useState<"idle" | "swapping" | "done" | "error">("idle");
  const [txSig, setTxSig] = useState("");
  const [summary, setSummary] = useState<SwapSummary | null>(null);
  const [error, setError] = useState("");

  // Auto-fetch quote when input changes
  const fetchQuote = useCallback(async () => {
    const amount = parseFloat(inputAmount);
    if (!inputAmount || isNaN(amount) || amount <= 0) {
      setQuote(null);
      return;
    }
    if (inputToken === outputToken) return;

    setQuoteLoading(true);
    setQuoteError("");
    try {
      const decimals = TOKEN_DECIMALS[inputToken];
      const lamports = String(Math.round(amount * 10 ** decimals));
      const q = await getSwapQuote(TOKEN_MINTS[inputToken], TOKEN_MINTS[outputToken], lamports);
      setQuote(q);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Could not fetch quote.");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [inputAmount, inputToken, outputToken]);

  useEffect(() => {
    const t = setTimeout(() => void fetchQuote(), 600);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  function flipTokens() {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount("");
    setQuote(null);
  }

  async function handleSwap() {
    if (!quote) return;
    if (state !== "unlocked") {
      openModal("unlock");
      return;
    }

    setStatus("swapping");
    setError("");
    try {
      const { swapTransactionBase64 } = await buildSwapTransaction(quote, walletAddress);
      const connection = getConnection();

      const txBytes = Uint8Array.from(atob(swapTransactionBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);

      // Jupiter bakes in a recent blockhash from its OWN RPC. Our proxy
      // (/api/rpc) forwards to a different node (Helius); if that node hasn't
      // observed Jupiter's blockhash yet at preflight it rejects the tx with
      // the misleading "Transaction did not pass signature verification" (empty
      // logs). Re-stamp the message with a blockhash from OUR RPC BEFORE
      // signing so the signature covers a blockhash the sending/simulating node
      // is guaranteed to know. Jupiter never pre-signs (the user is the only
      // required signer), so re-stamping is safe.
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.message.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirm by polling over HTTP — the /api/rpc proxy has no websocket,
      // so connection.confirmTransaction() would hang forever.
      await confirmSignature(connection, sig);

      setSummary({
        inAmount: inputAmount,
        inToken: inputToken,
        outAmount: formatTokenAmount(quote.outAmount, TOKEN_DECIMALS[outputToken]),
        outToken: outputToken,
      });
      setTxSig(sig);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed.");
      setStatus("error");
    }
  }

  const outAmount =
    quote
      ? formatTokenAmount(quote.outAmount, TOKEN_DECIMALS[outputToken])
      : null;
  const priceImpact = quote ? parseFloat(quote.priceImpactPct) : null;

  if (status === "done") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <CheckCircle2 size={26} />
          </span>
          <p className="text-base font-semibold text-white">Swap complete</p>
          <p className="text-xs text-white/45">Your balances will update shortly.</p>
        </div>

        {summary && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Image src={TOKEN_ICONS[summary.inToken]} alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40">You paid</p>
                <p className="text-sm font-semibold text-white">
                  {summary.inAmount} {summary.inToken}
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="shrink-0 text-white/35" />
            <div className="flex items-center gap-2">
              <Image src={TOKEN_ICONS[summary.outToken]} alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-white/40">You got</p>
                <p className="text-sm font-semibold text-emerald-200">
                  {summary.outAmount} {summary.outToken}
                </p>
              </div>
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
      <div className="flex items-center justify-end">
        <span className="text-[10px] text-white/35">0.25% Purple Club fee</span>
      </div>

      {/* Input token */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-white/40">You pay</span>
          {balances && (
            <button
              type="button"
              onClick={() => {
                const b = balances[inputToken.toLowerCase() as keyof WalletBalances];
                setInputAmount(String(b));
              }}
              className="text-[10px] text-gold-accent/70 hover:text-gold-accent"
            >
              Max: {balances[inputToken.toLowerCase() as keyof WalletBalances].toFixed(4)}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/25"
          />
          <TokenSelect
            value={inputToken}
            options={TOKENS.filter((t) => t !== outputToken)}
            onChange={(t) => { setInputToken(t); setQuote(null); }}
          />
        </div>
      </div>

      {/* Flip */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={flipTokens}
          className="rounded-full border border-white/10 bg-white/5 p-2 text-white/50 hover:text-white/80"
          title="Flip"
        >
          ⇅
        </button>
      </div>

      {/* Output token */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <span className="text-[10px] uppercase tracking-widest text-white/40">You receive</span>
        <div className="flex gap-2 items-center">
          <span className="flex-1 text-lg font-semibold text-white/80">
            {quoteLoading ? "…" : outAmount ?? "—"}
          </span>
          <TokenSelect
            value={outputToken}
            options={TOKENS.filter((t) => t !== inputToken)}
            onChange={(t) => { setOutputToken(t); setQuote(null); }}
          />
        </div>
      </div>

      {/* Quote details */}
      {quote && !quoteLoading && (
        <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 space-y-1 text-[11px] text-white/55">
          <div className="flex justify-between">
            <span>Price impact</span>
            <span className={priceImpact && priceImpact > 1 ? "text-amber-300" : "text-emerald-300"}>
              {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Purple Club fee (0.25%)</span>
            <span className="text-gold-accent">included</span>
          </div>
          <div className="flex justify-between">
            <span>Route</span>
            <span>Jupiter aggregator</span>
          </div>
        </div>
      )}

      {quoteError && <p className="text-xs text-amber-300">{quoteError}</p>}
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
          onClick={() => void handleSwap()}
          disabled={!quote || status === "swapping"}
          className="flex-1 rounded-xl bg-gold-accent px-3 py-2 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-40"
        >
          {status === "swapping" ? "Swapping…" : "Swap"}
        </button>
      </div>
    </div>
  );
}
