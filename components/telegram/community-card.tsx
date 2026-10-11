"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Status =
  | { kind: "loading" }
  | { kind: "not_connected" }
  | { kind: "waiting"; url: string }
  | { kind: "connecting" }
  | { kind: "ineligible"; balance: number }
  | { kind: "eligible"; inviteLink: string }
  | { kind: "in_group" }
  | { kind: "error"; message: string };

const INK_BTN =
  "inline-flex items-center justify-center bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--bone)]";

/**
 * Door into the group. The wallet is already signed in.
 * Connect opens the bot, which binds that Telegram id to this wallet.
 * Enter the group then mints a one-time invite.
 */
export function CommunityCard() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [groupUrl, setGroupUrl] = useState<string | null>(null);

  const loadState = useCallback(async (keepWaiting = false) => {
    try {
      const res = await fetch("/api/telegram/connect", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
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
      if (data.connected) {
        setStatus({ kind: "connecting" });
        await requestInvite(setStatus);
        return;
      }
      if (!keepWaiting) setStatus({ kind: "not_connected" });
    } catch {
      setStatus({ kind: "error", message: "Could not check the key." });
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (status.kind !== "waiting") return;
    const id = window.setInterval(() => {
      void loadState(true);
    }, 2000);
    return () => window.clearInterval(id);
  }, [status.kind, loadState]);

  const connect = useCallback(async () => {
    setStatus({ kind: "connecting" });
    try {
      const res = await fetch("/api/telegram/connect/start", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setStatus({ kind: "error", message: data.error ?? "Could not open Telegram. Try again." });
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
      setStatus({ kind: "waiting", url: data.url });
    } catch {
      setStatus({ kind: "error", message: "Could not open Telegram. Try again." });
    }
  }, []);

  return (
    <div>
      <Door
        status={status}
        groupUrl={groupUrl}
        onConnect={() => void connect()}
        onRetry={() => void loadState()}
      />
      <p className="mt-3 text-xs text-[var(--bone-dim)]">
        Keys are checked on-chain. We never ask for your seed phrase. Ever.
      </p>
    </div>
  );
}

async function requestInvite(
  setStatus: (status: Status) => void,
): Promise<void> {
  try {
    const res = await fetch("/api/telegram/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite" }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      status?: string;
      inviteLink?: string;
      balance?: number;
      error?: string;
    };
    if (!data.ok) {
      setStatus({ kind: "error", message: data.error ?? "Could not send the invite. Try again." });
      return;
    }
    if (data.status === "in_group") {
      setStatus({ kind: "in_group" });
    } else if (data.status === "eligible" && data.inviteLink) {
      setStatus({ kind: "eligible", inviteLink: data.inviteLink });
    } else if (data.status === "ineligible") {
      setStatus({ kind: "ineligible", balance: data.balance ?? 0 });
    } else {
      setStatus({ kind: "error", message: "Could not send the invite. Try again." });
    }
  } catch {
    setStatus({ kind: "error", message: "Could not send the invite. Try again." });
  }
}

function Door({
  status,
  groupUrl,
  onConnect,
  onRetry,
}: {
  status: Status;
  groupUrl: string | null;
  onConnect: () => void;
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

    case "waiting":
      return (
        <div>
          <a href={status.url} target="_blank" rel="noopener noreferrer" className={INK_BTN}>
            Open Telegram
          </a>
          <p className="mt-3 text-xs text-[var(--bone-dim)]">
            Tap Start in the bot. This page sends the invite when the link lands.
          </p>
        </div>
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
          <button type="button" onClick={onRetry} className={`${INK_BTN} mt-3`}>
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
            <a href={groupUrl} target="_blank" rel="noopener noreferrer" className={`${INK_BTN} mt-3`}>
              Enter the group
            </a>
          ) : null}
        </div>
      );

    case "not_connected":
    default:
      return (
        <div>
          <button type="button" onClick={onConnect} className={INK_BTN}>
            Connect Telegram
          </button>
          <p className="mt-3 text-xs text-[var(--bone-dim)]">
            Opens the bot. Tap Start. That links this wallet to your Telegram, then the invite is sent.
          </p>
        </div>
      );
  }
}
