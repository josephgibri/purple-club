"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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

const INK_BTN =
  "inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]";

/**
 * The door into the group. The member is already signed in. One Telegram
 * login binds the account and, when the key is held, returns a one-time invite.
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
        setStatus({ kind: "error", message: "Sign in, then try again." });
        return;
      }
      if (data.inGroup) {
        setStatus({ kind: "in_group" });
        return;
      }
      setStatus({ kind: "not_connected", botUsername: data.botUsername ?? "Purple_connect_bot" });
    } catch {
      setStatus({ kind: "error", message: "Could not check the key." });
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
        setStatus({ kind: "error", message: data.error ?? "Could not verify. Try again." });
        return;
      }
      if (data.status === "in_group") {
        setStatus({ kind: "in_group" });
      } else if (data.status === "eligible" && data.inviteLink) {
        setStatus({ kind: "eligible", inviteLink: data.inviteLink });
      } else if (data.status === "ineligible") {
        setStatus({ kind: "ineligible", balance: data.balance ?? 0 });
      } else {
        setStatus({ kind: "error", message: "Could not verify. Try again." });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not verify. Try again." });
    }
  }, []);

  return (
    <div>
      <Door status={status} groupUrl={groupUrl} onAuth={handleAuth} onRetry={() => void loadState()} />
      <p className="mt-3 text-xs text-[var(--bone-dim)]">
        Keys are checked on-chain. We never ask for your seed phrase. Ever.
      </p>
    </div>
  );
}

function Door({
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
    case "connecting":
      return (
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--ink)]">
          <Loader2 size={14} className="animate-spin" />
          Checking
        </p>
      );

    case "ineligible":
      return (
        <div>
          <p className="text-sm text-[var(--warn)]">The key is not held. Hold 1 PBTC, then try again.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]"
          >
            Try again
          </button>
        </div>
      );

    case "error":
      return (
        <div>
          <p className="text-sm text-[var(--warn)]">{status.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]"
          >
            Try again
          </button>
        </div>
      );

    case "eligible":
      return (
        <a href={status.inviteLink} target="_blank" rel="noopener noreferrer" className={INK_BTN}>
          Enter the group
        </a>
      );

    case "in_group":
      return (
        <div>
          <p className="text-sm text-[var(--bone)]">You are in the group.</p>
          {groupUrl ? (
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${INK_BTN} mt-3`}
            >
              Enter the group
            </a>
          ) : null}
        </div>
      );

    case "not_connected":
    default:
      return (
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone)]">Verify my key</p>
          <div className="mt-3">
            <TelegramLoginButton botUsername={status.botUsername} onAuth={onAuth} />
          </div>
        </div>
      );
  }
}
