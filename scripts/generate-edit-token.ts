/*
 * Manual recovery helper.
 *
 * Generates a merchant edit link when a merchant loses their bookmarked URL.
 *
 * Usage:
 *   npx tsx scripts/generate-edit-token.ts <email> <merchantId> [origin]
 *
 * Example:
 *   npx tsx scripts/generate-edit-token.ts owner@goldsgym.com golds-gym https://purpleclub.xyz
 *
 * Loads JWT_SIGNING_SECRET from .env.local. Prints a URL suitable for DMing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildEditUrl, signEditToken } from "../lib/editToken";

function loadEnvLocal() {
  const envFile = join(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(envFile, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local optional
  }
}

async function main() {
  loadEnvLocal();

  const [email, merchantId, originArg] = process.argv.slice(2);
  if (!email || !merchantId) {
    console.error(
      "Usage: npx tsx scripts/generate-edit-token.ts <email> <merchantId> [origin]",
    );
    process.exit(1);
  }

  const origin =
    originArg ?? process.env.PURPLE_CLUB_ORIGIN ?? "https://purpleclub.xyz";

  const token = await signEditToken({ merchantId, email });
  const url = buildEditUrl(origin, token);

  console.log("Edit URL (DM this to the merchant):\n");
  console.log(url);
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
