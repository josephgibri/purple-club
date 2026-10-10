"use client";

import { ScanLine, Sticker, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ProductGate } from "@/components/access/product-gate";

function clubApi(path: string) {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  return `${basePath}${path}`;
}

type Listing = {
  id: string;
  merchantId: string;
  businessName: string;
  kind: "physical" | "online";
  where: string;
  promoCode: string;
  discount: string;
  status: string;
  rejectionReason: string | null;
};

const STATUS: Record<string, { label: string; detail: string }> = {
  DRAFT: {
    label: "Draft",
    detail: "Saved, not sent for a check yet.",
  },
  SUBMITTED: {
    label: "Submitted",
    detail: "Under review. You will get an email when it is decided.",
  },
  UNDER_REVIEW: {
    label: "Under review",
    detail: "Someone is looking at this listing now.",
  },
  APPROVED: {
    label: "Approved",
    detail: "Live in Places. A change sends it back for another check.",
  },
  REJECTED: {
    label: "Changes requested",
    detail: "Read the note, change the listing, and send it again.",
  },
};

export default function BusinessPage() {
  return (
    <ProductGate
      eyebrow="Business"
      connectTitle="Sign in to your business"
      connectDescription="Connect the wallet that holds the key."
      unlockOnVerified
    >
      <BusinessDesk />
    </ProductGate>
  );
}

function BusinessDesk() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(clubApi("/api/places/list"), { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          listing?: Listing | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load your business.");
          return;
        }
        setListing(data.listing ?? null);
      } catch {
        if (!cancelled) setError("Could not load your business.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const status = listing ? (STATUS[listing.status] ?? STATUS.SUBMITTED) : null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col gap-6 px-6 py-8 sm:py-10">
      <header>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--bone-faint)]">You</p>
        <h1 className="club-display mt-2 text-3xl text-[var(--bone)] sm:text-4xl">Business</h1>
      </header>

      <section className="border border-[var(--line)] bg-[var(--wall-2)] p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--bone-faint)]">
          Your business
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--bone-dim)]">Loading…</p>
        ) : error ? (
          <p className="mt-3 text-sm text-[var(--warn)]">{error}</p>
        ) : listing && status ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg text-[var(--bone)]">{listing.businessName}</h2>
                <p className="mt-1 text-sm text-[var(--bone-dim)]">
                  {listing.kind === "online" ? "Online" : "Physical"}
                  {listing.kind === "physical" && listing.where ? ` · ${listing.where}` : ""}
                  {listing.kind === "online" && listing.promoCode ? ` · Code ${listing.promoCode}` : ""}
                </p>
                <p className="mt-1 text-sm text-[var(--bone)]">{listing.discount}</p>
              </div>
              <Link
                href="/account/business/list"
                className="inline-flex items-center bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--bone)]"
              >
                Edit
              </Link>
            </div>
            <div className="mt-4 border border-[var(--line)] px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--bone)]">{status.label}</p>
              <p className="mt-1 text-sm text-[var(--bone-dim)]">{status.detail}</p>
              {listing.rejectionReason ? (
                <p className="mt-2 text-sm text-[var(--warn)]">{listing.rejectionReason}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[var(--bone-dim)]">Nothing listed yet.</p>
            <Link
              href="/account/business/list"
              className="mt-4 inline-flex items-center gap-2 bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--bone)]"
            >
              <Store size={14} />
              List a business
            </Link>
          </div>
        )}
      </section>

      <DeskLink
        href={
          listing
            ? `/sticker?merchant=${encodeURIComponent(listing.merchantId)}`
            : "/sticker"
        }
        icon={<Sticker size={16} />}
        label="Club sticker"
        description={
          listing
            ? "Put it in the window. A scan starts the join, from your place."
            : "Put it in the window. A scan starts the join."
        }
      />

      <DeskLink
        href="/verify"
        icon={<ScanLine size={16} />}
        label="Verify a member"
        description="Scan their pass. A physical place applies the discount from the card."
      />
    </main>
  );
}

function DeskLink({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border border-[var(--line)] bg-[var(--wall-2)] px-4 py-4 text-[var(--bone)]"
    >
      <span className="text-[var(--ink)]">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--bone-dim)]">{description}</span>
      </span>
    </Link>
  );
}
