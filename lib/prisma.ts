// Compatibility shim for code ported from Purple Club, which imports
// `{ prisma }` from "@/lib/prisma" (and the sibling "./prisma"). Purple
// Club's single client lives in lib/db.ts as `db`; re-export it as `prisma`
// so the ported travel/gift/campaign/burn code works unchanged.
export { db as prisma } from "./db";
