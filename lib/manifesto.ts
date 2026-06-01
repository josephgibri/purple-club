/**
 * Manifesto content — beliefs + founder note. Adapted from the original
 * purple-hub copy, with the social-layer (Telegram Lounge / Guild.xyz)
 * framing removed: the tribe shows up through ranks and real savings,
 * not a chat product.
 */

export type Belief = {
  heading: string;
  body: string;
};

export const MANIFESTO_BELIEFS: readonly Belief[] = [
  {
    heading: "The asset belongs to its holders.",
    body: "The most valuable digital assets should belong to the people who hold them — not to the companies that issued them. Purple Club exists to prove that structure is possible.",
  },
  {
    heading: "Scarcity and utility are not opposites.",
    body: "Scarcity without utility is speculation. Utility without scarcity is a coupon. We refuse to choose. PBTC is scarce by mechanism. Purple Club is useful by design.",
  },
  {
    heading: "A treasury that can be drained is not a treasury.",
    body: "Purple Council governs an ownerless treasury. The founder cannot extract it. Every outflow requires a passed proposal. Verify on-chain before you join — we don't ask you to trust us.",
  },
  {
    heading: "Membership is not a loyalty program.",
    body: "It is a tribe. Ranks in The Purple Court are earned, not bought. Merchants join because members show up — and members stay because the savings are real and the standing is theirs.",
  },
  {
    heading: "We are not building a token.",
    body: "We are building a movement that uses one. The ecosystem works when the community believes in it, contributes to it, and holds each other accountable. That is the whole point.",
  },
] as const;

export const FOUNDER_NOTE = {
  heading: "Why we're building this",
  body: [
    "Purple Club started from a simple conviction: digital scarcity only matters if ordinary people can actually use it — and if no single person can take it away.",
    "We built the ownerless treasury, the burn engine, and the membership network so the community wouldn't have to trust a founder. The movement succeeds when merchants join because members show up, and members show up because they believe in what they're building together.",
    "You're not signing up for an app. You're joining the founding cohort of a community-owned network.",
  ],
} as const;
