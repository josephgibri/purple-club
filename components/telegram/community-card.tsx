"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";

import { JUPITER_SWAP_URL } from "@/lib/constants";
import {
  TelegramLoginButton,
  type TelegramAuthUser,
} from "@/components/telegram/telegram-login-button";

type Status =
  | { kind: "loading" }
  | { kind: "not_connected"; botUsername: string }
  | { kind: "connecting" }
  | { kind: "ineligible"; balance: number }
  | { kind: "eligible"; inviteLink: string }
  | { kind: "in_group" }
  | { kind: "error"; message: string };

/**
 * Website-first community onboarding. The member is already SIWS-verified on
 * the site (this card only renders inside the gated /account dashboard), so a
 * single Telegram Login Widget click binds their Telegram account and — if
 * they hold ≥ 1 PBTC — surfaces a one-time invite link to the private group.
 */
export function CommunityCard() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/connect", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        botUsername?: string;
        connected?: boolean;
        inGroup?: boolean;
      };
      if (!data.ok) {
        setStatus({ kind: "error", message: "Sign in to connect Telegram." });
        return;
      }
      if (data.inGroup) {
        setStatus({ kind: "in_group" });
        return;
      }
      setStatus({ kind: "not_connected", botUsername: data.botUsername ?? "Purple_connect_bot" });
    } catch {
      setStatus({ kind: "error", message: "Couldn't load community status." });
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleAuth = useCallback(async (user: TelegramAuthUser) => {
    setStatus({ kind: "connecting" });
    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        inviteLink?: string;
        balance?: number;
        error?: string;
      };
      if (!data.ok) {
        setStatus({ kind: "error", message: data.error ?? "Linking failed. Please try again." });
        return;
      }
      if (data.status === "in_group") {
        setStatus({ kind: "in_group" });
      } else if (data.status === "eligible" && data.inviteLink) {
        setStatus({ kind: "eligible", inviteLink: data.inviteLink });
      } else if (data.status === "ineligible") {
        setStatus({ kind: "ineligible", balance: data.balance ?? 0 });
      } else {
        setStatus({ kind: "error", message: "Unexpected response. Please try again." });
      }
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }, []);

  return (
    <section className="rounded-3xl border border-purple-accent/30 bg-gradient-to-br from-[#1a0c39] via-[#130922] to-[#0e0720] p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-purple-300">
        <Send size={13} />
        Community Lounge
      </div>

      <CardBody status={status} onAuth={handleAuth} onRetry={() => void loadState()} />
    </section>
  );
}

function CardBody({
  status,
  onAuth,
  onRetry,
}: {
  status: Status;
  onAuth: (user: TelegramAuthUser) => void;
  onRetry: () => void;
}) {
  switch (status.kind) {
    case "loading":
      return (
        <div className="mt-4 flex items-center gap-2 text-sm text-violet-100/65">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      );

    case "in_group":
      return (
        <>
          <h2 className="mt-3 flex items-center gap-2 text-lg font-semibold text-white">
            <CheckCircle2 size={18} className="text-emerald-400" />
            You&apos;re in the lounge
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-violet-100/65">
            Your Telegram is linked and you&apos;re a member of the Purple Club group.
            Your tier updates automatically with your holdings.
          </p>
        </>
      );

    case "eligible":
      return (
        <>
          <h2 className="mt-3 text-lg font-semibold text-white">You&apos;re verified — join the group</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-violet-100/65">
            Tap below to open your one-time invite in Telegram. It expires in an hour.
          </p>
          <a
            href={status.inviteLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-purple-accent/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-purple-accent"
          >
            Join the group
            <ArrowRight size={12} />
          </a>
        </>
      );

    case "ineligible":
      return (
        <>
          <h2 className="mt-3 text-lg font-semibold text-white">Telegram connected</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-violet-100/65">
            You hold {status.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PBTC.
            Hold at least 1 PBTC to unlock your invite to the community.
          </p>
          <a
            href={JUPITER_SWAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110"
          >
            Buy PBTC
            <ArrowRight size={12} />
          </a>
        </>
      );

    case "connecting":
      return (
        <div className="mt-4 flex items-center gap-2 text-sm text-violet-100/65">
          <Loader2 size={16} className="animate-spin" />
          Verifying your Telegram…
        </div>
      );

    case "error":
      return (
        <>
          <p className="mt-3 text-sm text-red-300">{status.message}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-purple-300 hover:text-purple-200"
          >
            Try again
          </button>
        </>
      );

    case "not_connected":
    default:
      return (
        <>
          <h2 className="mt-3 text-lg font-semibold text-white">Join the Purple Club group</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-violet-100/65">
            Connect with fellow members and build the tribe. Link your Telegram —
            one click, no bot commands — and we&apos;ll get you in.
          </p>
          <div className="mt-4">
            <TelegramLoginButton
              botUsername={status.botUsername}
              onAuth={onAuth}
            />
          </div>
        </>
      );
  }
}
