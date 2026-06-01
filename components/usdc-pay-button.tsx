"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { toast } from "sonner";

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function getClientUsdcMint(): PublicKey {
  const fromEnv = process.env.NEXT_PUBLIC_USDC_MINT?.trim();
  return new PublicKey(fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_USDC_MINT);
}

export type UsdcPayButtonState =
  | "idle"
  | "preflight"
  | "signing"
  | "submitted"
  | "confirming"
  | "verifying"
  /**
   * On-chain confirmation succeeded but the immediate `/verify-payment`
   * call hasn't yet observed the matched booking (Helius webhook lag,
   * race with our matcher, or transient verify failure). The parent is
   * polling silently — we keep the user calmly informed instead of
   * mis-claiming "verified".
   */
  | "awaiting"
  | "done";

export type UsdcPayButtonProps = {
  /** Recipient (Purple Club treasury) base58 address. */
  usdcPaymentAddress: string;
  /**
   * Lamports the wallet will be asked to sign (6-decimal). For the
   * connected-wallet rail this is typically the rounded dollar floor of
   * the salted invoice (e.g. 1_000_000 for a $1 booking even though the
   * stored invoice is 1_009_694). The on-chain matcher accepts any amount
   * in `[floor, salted]` when the reference pubkey is attached.
   */
  expectedUsdcLamports: string;
  /** Solana Pay reference pubkey (base58). */
  paymentReferencePubkey: string | null;
  /** Booking code (used for the verify endpoint and toasts). */
  requestCode: string;
  /** Display amount on the button + toasts, e.g. "1.00". */
  amountLabel: string;
  /**
   * Called once the on-chain transaction has been confirmed and we want the
   * parent to take over (poll `/verify-payment`, refresh the dashboard,
   * close the sheet on PAYMENT_VERIFIED). Fires whether the inline verify
   * call succeeded or not — the parent is the source of truth for the
   * server-side verification state.
   */
  onSubmitted?: () => void;
  /** State change callback (idle → signing → submitted → confirming → verifying → done). */
  onStateChange?: (state: UsdcPayButtonState) => void;
  /**
   * Runs after the user clicks but before the wallet popup opens. Use this
   * to persist booking guest names / lock the offer server-side so the
   * on-chain match has somewhere to land. Return false to abort cleanly
   * (e.g. validation failed); the wallet popup will not open.
   */
  onBeforePay?: () => boolean | Promise<boolean>;
  /** Render the button disabled with a tooltip / surfaced reason on hover. */
  disabled?: boolean;
  /** Reason shown when disabled is true (e.g. "Fill every guest first."). */
  disabledReason?: string;
};

/**
 * In-page USDC payment button. Builds an SPL `transferChecked` against the
 * USDC mint, attaches the Solana Pay reference pubkey as a non-signer
 * account on the last instruction (so the on-chain matcher in
 * `findMatchingRequest` picks it up), and pings `/verify-payment` once
 * the tx is confirmed.
 *
 * Renders nothing if no wallet is connected — the parent should fall back
 * to the Solana Pay deep-link in that case.
 */
export function UsdcPayButton({
  usdcPaymentAddress,
  expectedUsdcLamports,
  paymentReferencePubkey,
  requestCode,
  amountLabel,
  onSubmitted,
  onStateChange,
  onBeforePay,
  disabled = false,
  disabledReason,
}: UsdcPayButtonProps) {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [state, setState] = useState<UsdcPayButtonState>("idle");

  if (!connected || !publicKey) {
    return null;
  }

  const busy = state !== "idle" && state !== "done";

  function moveTo(next: UsdcPayButtonState) {
    setState(next);
    onStateChange?.(next);
  }

  async function handleClick() {
    if (!publicKey) return;
    if (disabled) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }
    if (onBeforePay) {
      const ok = await onBeforePay();
      if (!ok) return;
    }
    moveTo("preflight");
    let signature: string | null = null;

    try {
      const usdcMint = getClientUsdcMint();
      const recipient = new PublicKey(usdcPaymentAddress);
      const lamports = BigInt(expectedUsdcLamports);

      const senderAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipient);

      try {
        const senderAccount = await getAccount(connection, senderAta);
        if (senderAccount.amount < lamports) {
          throw new Error(
            `Your wallet balance is too low. You need ${amountLabel} USDC.`,
          );
        }
      } catch (err) {
        if (err instanceof TokenAccountNotFoundError) {
          throw new Error(
            "Your wallet has no USDC token account on Solana mainnet. Top up USDC first.",
          );
        }
        throw err;
      }

      const transferIx = createTransferCheckedInstruction(
        senderAta,
        usdcMint,
        recipientAta,
        publicKey,
        lamports,
        6,
      );

      // Solana Pay reference attaches the booking's unique pubkey as a
      // non-signer account on the transfer instruction. The on-chain matcher
      // (`findMatchingRequest` in src/lib/usdc.ts) keys off this to associate
      // the transfer with the booking even when the wallet signs the
      // floored-dollar amount instead of the salted invoice total. If the
      // reference is missing or malformed we MUST refuse to send — without
      // it the matcher can only fall back to amount-only matching, which
      // requires the salted total exactly. The wallet would happily transfer
      // the funds and they'd land in the treasury without ever being linked
      // to this booking. Loud failure here avoids that lost-payment failure
      // mode entirely.
      if (!paymentReferencePubkey) {
        throw new Error(
          "Payment reference is missing for this booking. Refresh the page and try again, or contact concierge if it persists.",
        );
      }
      try {
        const ref = new PublicKey(paymentReferencePubkey);
        transferIx.keys.push({ pubkey: ref, isSigner: false, isWritable: false });
      } catch {
        throw new Error(
          "Payment reference is invalid for this booking. Refresh the page and try again, or contact concierge if it persists.",
        );
      }

      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          recipientAta,
          recipient,
          usdcMint,
        ),
      );
      tx.add(transferIx);

      const latestBlockhash = await connection.getLatestBlockhash();
      tx.feePayer = publicKey;
      tx.recentBlockhash = latestBlockhash.blockhash;

      moveTo("signing");
      signature = await sendTransaction(tx, connection);

      moveTo("submitted");
      toast.success("Transaction sent — waiting for finality.");

      moveTo("confirming");
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      moveTo("verifying");
      let verified = false;
      try {
        const res = await fetch(
          `/api/travel/requests/${encodeURIComponent(requestCode)}/verify-payment`,
          { method: "POST" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          reason?: string;
        };
        verified =
          res.ok &&
          (data.status === "PAYMENT_VERIFIED" || data.status === "CONFIRMED");
      } catch {
        // Verify endpoint blip; fall through to the awaiting state and let
        // the parent's poller handle it.
      }

      if (verified) {
        moveTo("done");
        toast.success("Payment verified on-chain.");
      } else {
        // Tx is on-chain but the server hasn't yet confirmed the match.
        // Notify the user honestly, switch into the "awaiting" state, and
        // let the parent (which polls /verify-payment every 5s while the
        // booking sheet is open) take over.
        moveTo("awaiting");
        toast.message(
          "Transaction sent. We're auto-verifying on-chain — this usually takes 10-30 seconds.",
        );
      }
      onSubmitted?.();
    } catch (error) {
      const message = describeError(error);
      toast.error(message);
      moveTo("idle");
    }
  }

  const label = (() => {
    switch (state) {
      case "preflight":
        return "Checking wallet…";
      case "signing":
        return "Open your wallet to sign…";
      case "submitted":
        return "Submitting to Solana…";
      case "confirming":
        return "Waiting for finality…";
      case "verifying":
        return "Verifying on-chain…";
      case "awaiting":
        return "Auto-verifying on-chain…";
      case "done":
        return "Payment sent";
      default:
        return `Pay $${amountLabel} USDC`;
    }
  })();

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy || state === "done" || disabled}
      title={disabled ? disabledReason : undefined}
      className="pt-cta-gold inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {busy ? <Spinner /> : null}
      <span>{label}</span>
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black"
      aria-hidden
    />
  );
}

function describeError(error: unknown): string {
  if (!error) return "Payment failed.";
  if (error instanceof Error) {
    const msg = error.message || "Payment failed.";
    if (/User rejected|reject(ed)? the request/i.test(msg)) {
      return "You cancelled the wallet popup. Try again when you're ready.";
    }
    return msg;
  }
  return "Payment failed.";
}
