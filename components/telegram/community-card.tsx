"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  const [groupUrl, setGroupUrl] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/connect", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        botUsername?: string;
        groupUrl?: string | null;
        connected?: boolean;
        inGroup?: boolean;
      };
      setGroupUrl(data.groupUrl ?? null);
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

      <CardBody
        status={status}
        groupUrl={groupUrl}
        onAuth={handleAuth}
        onRetry={() => void loadState()}
      />
    </section>
  );
}

/** Full-width banner layout: copy on the left, the call-to-action on the right. */
function Banner({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="max-w-xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-violet-100/65">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const PURPLE_BTN =
  "inline-flex items-center gap-1.5 rounded-full bg-purple-accent/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-purple-accent";
const GOLD_BTN =
  "inline-flex items-center gap-1.5 rounded-full bg-gold-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:brightness-110";

function CardBody({
  status,
  groupUrl,
  onAuth,
  onRetry,
}: {
  status: Status;
  groupUrl: string | null;
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
        <Banner
          title={
            <>
              <CheckCircle2 size={18} className="text-emerald-400" />
              You&apos;re in the lounge
            </>
          }
          description="Your Telegram is linked and you're a member of the Purple Club group. Your tier updates automatically with your holdings."
          action={
            groupUrl ? (
              <a href={groupUrl} target="_blank" rel="noopener noreferrer" className={PURPLE_BTN}>
                Open Telegram group
                <ArrowRight size={12} />
              </a>
            ) : null
          }
        />
      );

    case "eligible":
      return (
        <Banner
          title="You're verified — join the group"
          description="Tap to open your one-time invite in Telegram. It expires in an hour."
          action={
            <a href={status.inviteLink} target="_blank" rel="noopener noreferrer" className={PURPLE_BTN}>
              Join the group
              <ArrowRight size={12} />
            </a>
          }
        />
      );

    case "ineligible":
      return (
        <Banner
          title="Telegram connected"
          description={`You hold ${status.balance.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })} PBTC. Hold at least 1 PBTC to unlock your invite to the community.`}
          action={
            <a href={JUPITER_SWAP_URL} target="_blank" rel="noopener noreferrer" className={GOLD_BTN}>
              Buy PBTC
              <ArrowRight size={12} />
            </a>
          }
        />
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
        <Banner
          title="Join the Purple Club group"
          description="Connect with fellow members and build the tribe. Link your Telegram — one click, no bot commands — and we'll get you in."
          action={<TelegramLoginButton botUsername={status.botUsername} onAuth={onAuth} />}
        />
      );
  }
}
