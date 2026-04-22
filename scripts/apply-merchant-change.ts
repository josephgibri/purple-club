/*
 * Applies a single merchant change to data/merchants.json.
 *
 * Invoked by the merchant-approve workflow after it parses a GitHub Issue body.
 * Accepts the payload either as an argument (path to a JSON file) or from stdin.
 *
 * Usage:
 *   npx tsx scripts/apply-merchant-change.ts payload.json
 *   cat payload.json | npx tsx scripts/apply-merchant-change.ts
 *
 * Exits non-zero with a human-readable error on validation failure so the
 * workflow can post the message back to the issue.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type MerchantRecord,
  merchantArraySchema,
  payloadToRecord,
  submissionPayloadSchema,
} from "../lib/merchantSchema";

const DATA_FILE = join(process.cwd(), "data", "merchants.json");

type ChangeType = "submit" | "update" | "remove";

function readPayload(): unknown {
  const arg = process.argv[2];
  if (arg) {
    return JSON.parse(readFileSync(arg, "utf8"));
  }
  const stdin = readFileSync(0, "utf8");
  if (!stdin.trim()) {
    throw new Error("No payload provided via arg or stdin");
  }
  return JSON.parse(stdin);
}

function readMerchants(): MerchantRecord[] {
  const raw = readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return merchantArraySchema.parse(parsed);
}

function writeMerchants(records: MerchantRecord[]) {
  const validated = merchantArraySchema.parse(records);
  writeFileSync(
    DATA_FILE,
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );
}

function applyChange(
  records: MerchantRecord[],
  change: { type: ChangeType; record?: MerchantRecord; merchantId?: string },
): MerchantRecord[] {
  if (change.type === "remove") {
    if (!change.merchantId)
      throw new Error("remove payload missing merchantId");
    const before = records.length;
    const next = records.filter((r) => r.id !== change.merchantId);
    if (next.length === before) {
      throw new Error(`No merchant with id "${change.merchantId}" to remove`);
    }
    return next;
  }
  if (!change.record) throw new Error("submit/update payload missing record");
  const record = change.record;
  if (change.type === "update") {
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx === -1) {
      throw new Error(`No merchant with id "${record.id}" to update`);
    }
    const next = records.slice();
    next[idx] = record;
    return next;
  }
  // submit / append
  if (records.some((r) => r.id === record.id)) {
    throw new Error(
      `Slug collision: "${record.id}" already exists. Ask the merchant for a modifier (e.g. "${record.id}-miami").`,
    );
  }
  return [...records, record];
}

function main() {
  const raw = readPayload();
  const parsed = submissionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid payload: ${msg}`);
  }
  const payload = parsed.data;
  const type = payload.type as ChangeType;

  const records = readMerchants();

  if (type === "remove") {
    const next = applyChange(records, {
      type,
      merchantId: payload.merchantId,
    });
    writeMerchants(next);
    console.log(`Removed merchant ${payload.merchantId}`);
    return;
  }

  const record = payloadToRecord(payload);
  const next = applyChange(records, { type, record });
  writeMerchants(next);
  console.log(
    `${type === "submit" ? "Added" : "Updated"} merchant ${record.id}`,
  );
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
