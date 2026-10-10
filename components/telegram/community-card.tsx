"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

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
    <section className="rounded-lg border border-[var(--line)] bg-[var(--wall-2)] p-6">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">
        Telegram
      </p>

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
        <h2 className="flex items-center gap-2 text-lg text-[var(--bone)]">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--bone-dim)]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const GROUP_BTN =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]";

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
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--bone-dim)]">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      );

    case "in_group":
      return (
        <Banner
          title={
            <>
              <CheckCircle2 size={18} className="text-[var(--ok)]" />
              You&apos;re in the group
            </>
          }
          description="The club talks here. Bookings, places, and votes are the record. The conversation is on Telegram."
          action={
            groupUrl ? (
              <a href={groupUrl} target="_blank" rel="noopener noreferrer" className={GROUP_BTN}>
                Open the group
                <ArrowRight size={12} />
              </a>
            ) : null
          }
        />
      );

    case "eligible":
      return (
        <Banner
          title="Join the group"
          description="This invite works once and expires in an hour. The club talks on Telegram."
          action={
            <a href={status.inviteLink} target="_blank" rel="noopener noreferrer" className={GROUP_BTN}>
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
          })} PBTC. Hold at least 1 PBTC to get the invite.`}
          action={
            <a href={JUPITER_SWAP_URL} target="_blank" rel="noopener noreferrer" className={GROUP_BTN}>
              Buy PBTC
              <ArrowRight size={12} />
            </a>
          }
        />
      );

    case "connecting":
      return (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--bone-dim)]">
          <Loader2 size={16} className="animate-spin" />
          Verifying your Telegram…
        </div>
      );

    case "error":
      return (
        <>
          <p className="mt-3 text-sm text-[var(--warn)]">{status.message}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink)]"
          >
            Try again
          </button>
        </>
      );

    case "not_connected":
    default:
      return (
        <Banner
          title="The group"
          description="All the talk is on Telegram. Link once, then open the group from here."
          action={<TelegramLoginButton botUsername={status.botUsername} onAuth={onAuth} />}
        />
      );
  }
}
