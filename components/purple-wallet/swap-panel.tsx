"use client";

import { useState, useEffect, useCallback } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
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
import { TokenSelect } from "./token-select";

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

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latestBlockhash },
        "confirmed",
      );

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
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <p className="font-semibold">Swap complete.</p>
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-accent">Swap</p>
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
