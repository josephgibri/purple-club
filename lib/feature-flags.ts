/**
 * Feature flags driven by environment variables. Keep them isolated in this
 * single helper so flipping a flag is one env var in Vercel and we never
 * need to grep for `process.env.X === "true"` across the codebase.
 *
 * Flags use the `NEXT_PUBLIC_` prefix so they're inlined into the client
 * bundle at build time. They're not secrets — they only gate UI affordances
 * and validation. Server-side code that enforces them must still verify
 * server-side (see e.g. `submit_payment` rejecting STRIPE when card is off).
 */

/**
 * Card / Stripe payment surfaces are reversible-disabled. When this returns
 * `false` we hide the credit-card option from members, drop the
 * payment-link requirement on the agent admin form, refuse `STRIPE` in the
 * `submit_payment` API, and shift homepage copy to USDC-only. Set
 * `NEXT_PUBLIC_CARD_PAYMENTS_ENABLED=true` in Vercel to bring card back —
 * no schema or code change needed because we leave the `STRIPE` enum,
 * `paymentLink` fields, and notification copy intact, just gated.
 */
export function cardPaymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CARD_PAYMENTS_ENABLED === "true";
}
