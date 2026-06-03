"use client";

/**
 * Offline fallback page. Served by the service worker when the user has
 * no network connection and the requested page isn't in the cache.
 * Must be a Client Component — it uses an onClick reload handler.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full bg-gold-accent/50 shadow-[0_0_18px_rgba(246,196,83,0.4)]"
      />
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-sm text-violet-100/65">
        Purple Club needs a connection to verify your wallet and load live data.
        Check your network and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded-full border border-gold-accent/50 px-5 py-2.5 text-sm font-semibold text-gold-accent transition hover:bg-gold-accent/10"
      >
        Try again
      </button>
    </main>
  );
}
