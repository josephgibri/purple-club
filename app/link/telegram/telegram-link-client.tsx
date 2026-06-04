"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletSignIn } from "@/hooks/useWalletSignIn";
import { useWalletAuth } from "@/hooks/useWalletAuth";

type Stage = "validating" | "sign-in" | "linking" | "done" | "error";

export function TelegramLinkClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [stage, setStage] = useState<Stage>("validating");
  const [errorMsg, setErrorMsg] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");

  const { isVerified } = useWalletAuth();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const { enter, isPending, error: signInError } = useWalletSignIn();

  // Step 1 — Validate token on mount
  useEffect(() => {
    if (!token) {
      setStage("error");
      setErrorMsg("No token provided. Please use the /link command in the bot again.");
      return;
    }

    fetch(`/api/telegram/link/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; error?: string; username?: string }) => {
        if (!data.ok) {
          setStage("error");
          setErrorMsg(data.error ?? "Invalid or expired link. Use /link in the bot to get a new one.");
          return;
        }
        setTelegramUsername(data.username ?? "");
        setStage("sign-in");
      })
      .catch(() => {
        setStage("error");
        setErrorMsg("Network error. Please try again.");
      });
  }, [token]);

  // Step 2 — Once signed in, call the link API
  useEffect(() => {
    if (stage !== "sign-in" && stage !== "linking") return;
    if (!isVerified || !walletAddress) return;

    setStage("linking");
    fetch("/api/telegram/link/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; error?: string }) => {
        if (!data.ok) {
          setStage("error");
          setErrorMsg(data.error ?? "Linking failed. Please try /link again.");
          return;
        }
        setStage("done");
      })
      .catch(() => {
        setStage("error");
        setErrorMsg("Network error during linking. Please try again.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerified, walletAddress]);

  if (stage === "validating") {
    return <LoadingCard message="Validating your link…" />;
  }

  if (stage === "error") {
    return (
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-red-400/30 bg-white/5 p-8 text-center backdrop-blur-xl">
        <AlertTriangle size={40} className="mx-auto text-red-400" />
        <h1 className="pc-serif mt-4 text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-violet-100/70">{errorMsg}</p>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-emerald-400/30 bg-white/5 p-8 text-center backdrop-blur-xl">
        <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
        <h1 className="pc-serif mt-4 text-xl font-semibold text-white">Wallet linked!</h1>
        <p className="mt-3 text-sm text-violet-100/70">
          Your wallet is now verified. Go back to the bot and use{" "}
          <span className="font-mono text-gold-accent">/join</span> to request your group invite.
        </p>
      </div>
    );
  }

  if (stage === "linking") {
    return <LoadingCard message="Linking your wallet…" />;
  }

  // stage === "sign-in"
  return (
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-accent/45 bg-purple-accent/15">
        <span className="text-2xl">💜</span>
      </div>
      <h1 className="pc-serif text-xl font-semibold text-white">
        Link your wallet to Telegram
      </h1>
      {telegramUsername ? (
        <p className="mt-2 text-sm text-violet-100/70">
          Connecting for{" "}
          <span className="font-semibold text-white">@{telegramUsername}</span>
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-violet-100/65">
        Sign in with your Solana wallet below. This is a read-only verification —
        your tokens never move.
      </p>

      <button
        onClick={() => void enter()}
        disabled={isPending}
        className="mt-6 w-full rounded-2xl bg-gold-accent px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Signing in…
          </span>
        ) : (
          "Sign in with Wallet"
        )}
      </button>

      {signInError ? (
        <p className="mt-3 text-xs text-red-300">{signInError}</p>
      ) : null}
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-4 text-center">
      <Loader2 size={32} className="animate-spin text-gold-accent" />
      <p className="text-sm text-violet-100/70">{message}</p>
    </div>
  );
}
