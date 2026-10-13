"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

export function AppInvites() {
  const [open, setOpen] = useState(true);
  const [memberCap, setMemberCap] = useState("3");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/app/admin");
      if (!response.ok) return;
      const data = (await response.json()) as { open: boolean; memberCap: number };
      setOpen(data.open);
      setMemberCap(String(data.memberCap));
    })();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/app/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open, memberCap: Number(memberCap) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      toast.success(open ? "App invites are open." : "App invites are closed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    setBusy(true);
    try {
      const response = await fetch("/api/app/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await response.json()) as { error?: string; signature?: string };
      if (!response.ok) throw new Error(data.error ?? "The vault could not send.");
      toast.success("1 PBTC sent.");
      setAddress("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The vault could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">App invites</p>
      <p className="mt-2 max-w-xl text-sm text-white/70">
        Closed stops new invites and new redemptions. The cap is how many invites one member can send.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} />
          Invites open
        </label>
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
          Cap
          <input
            value={memberCap}
            onChange={(event) => setMemberCap(event.target.value)}
            inputMode="numeric"
            className="w-20 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm normal-case tracking-normal text-white"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-[#7C3AED] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white"
        >
          Save
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid min-w-[280px] flex-1 gap-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
          Grant 1 PBTC to an address
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm normal-case tracking-normal text-white"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void grant()}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white"
        >
          Send
        </button>
      </div>
    </article>
  );
}
