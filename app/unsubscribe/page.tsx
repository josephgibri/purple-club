import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unsubscribe | Purple Club",
  description: "Manage email notifications from Purple Club.",
  // Unsubscribe URLs may carry email-tied tokens via query/path. Keep them
  // out of public indexes so token-bearing links never become discoverable
  // through Google.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function UnsubscribePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 pt-star-field opacity-35" />
      <div className="pointer-events-none absolute -top-40 right-[-140px] h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-2xl px-6 py-12">
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
            Email preferences
          </span>
          <h1 className="pt-serif mt-3 text-4xl font-semibold text-white sm:text-5xl">
            Unsubscribe request received
          </h1>
        </div>

        <article className="pt-glass space-y-5 rounded-3xl p-6 text-sm leading-relaxed text-white/80 sm:p-8">
          <p>
            The emails we send from Purple Club are tied to active travel
            requests, payments, and bookings. They are transactional
            notifications about your own activity on the platform, not
            marketing content.
          </p>
          <p>
            If you would still like to stop receiving them, reply to{" "}
            <a
              href="mailto:concierge@purpleclub.org"
              className="text-[#FDE047] underline-offset-2 hover:underline"
            >
              concierge@purpleclub.org
            </a>{" "}
            and the team will help you wrap up any open requests and remove
            your address from future notifications.
          </p>
          <p className="text-xs text-white/55">
            Note: while a booking is in flight (offer ready, payment submitted,
            confirmed) we may still need to email you for anything that
            requires action on your end, even after an unsubscribe request.
          </p>
        </article>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#EAB308]/60 bg-[#EAB308]/10 px-5 text-xs font-semibold text-[#FDE68A] hover:bg-[#EAB308]/20"
          >
            Back to Purple Club
          </Link>
          <Link
            href="/stay"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            Open my Travel Vault
          </Link>
        </div>
      </section>
    </main>
  );
}
