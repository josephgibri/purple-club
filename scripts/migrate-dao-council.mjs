/**
 * Copy Purple DAO donations, credits, proposals, and votes into the club database.
 * Read-only on the DAO. A second run does not insert rows that already exist.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const clubRoot = path.resolve(import.meta.dirname, "..");
loadEnv(path.join(clubRoot, ".env.local"));
loadEnv(path.join(clubRoot, ".env"));

const daoEnv = {};
const daoFile = path.resolve(clubRoot, "../Purple DAO/web/.env.local");
if (fs.existsSync(daoFile)) {
  for (const line of fs.readFileSync(daoFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    daoEnv[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

function pgUrl(value) {
  return value
    .replace(/([?&])channel_binding=[^&]*/g, "")
    .replace("?&", "?")
    .replace(/[?&]$/, "");
}

const clubUrl = process.env.DATABASE_URL ? pgUrl(process.env.DATABASE_URL) : "";
const daoUrl = daoEnv.DATABASE_URL ? pgUrl(daoEnv.DATABASE_URL) : "";
if (!clubUrl || !daoUrl) {
  console.error("Club DATABASE_URL or DAO DATABASE_URL is missing.");
  process.exit(1);
}
if (clubUrl === daoUrl) {
  console.error("Refusing to copy a database onto itself.");
  process.exit(1);
}

const dao = new pg.Client({ connectionString: daoUrl });
const club = new pg.Client({ connectionString: clubUrl });

function cuid() {
  return `dao${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function counts(client) {
  const ledger = await client.query("SELECT COUNT(*)::int AS n FROM cc_ledger");
  const credit = await client.query(
    "SELECT COALESCE(SUM(delta_cc), 0)::int AS n FROM cc_ledger WHERE expires_at IS NULL OR expires_at > NOW()",
  );
  const proposals = await client.query("SELECT COUNT(*)::int AS n FROM proposals");
  const votes = await client.query("SELECT COUNT(*)::int AS n FROM votes");
  const requests = await client.query("SELECT COUNT(*)::int AS n FROM cc_requests");
  const claims = await client.query("SELECT COUNT(*)::int AS n FROM legacy_cc_claims");
  return {
    ledger: ledger.rows[0].n,
    activeCredit: credit.rows[0].n,
    proposals: proposals.rows[0].n,
    votes: votes.rows[0].n,
    requests: requests.rows[0].n,
    claims: claims.rows[0].n,
  };
}

async function main() {
  await club.connect();
  try {
    await dao.connect();
  } catch (error) {
    console.error("DAO database rejected the stored credentials. The club database was not changed.");
    throw error;
  }

  const wallets = await dao.query(`
    SELECT wallet_pubkey AS wallet FROM cc_ledger
    UNION SELECT wallet_pubkey FROM cc_requests
    UNION SELECT created_by_wallet FROM proposals
    UNION SELECT wallet_pubkey FROM votes
  `);
  for (const row of wallets.rows) {
    await club.query(
      `INSERT INTO "User" (id, wallet, "hasUnlockedGifting", "createdAt", "updatedAt")
       VALUES ($1, $2, false, NOW(), NOW())
       ON CONFLICT (wallet) DO NOTHING`,
      [cuid(), row.wallet],
    );
  }

  const ledger = await dao.query("SELECT * FROM cc_ledger ORDER BY id");
  for (const row of ledger.rows) {
    await club.query(
      `INSERT INTO cc_ledger (
         id, wallet_pubkey, delta_cc, source, reason, proof, admin_wallet, created_at,
         expires_at, source_tx_sig, source_contract, multiplier, base_pbtc
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.wallet_pubkey,
        row.delta_cc,
        row.source,
        row.reason,
        row.proof,
        row.admin_wallet,
        row.created_at,
        row.expires_at,
        row.source_tx_sig,
        row.source_contract,
        row.multiplier,
        row.base_pbtc,
      ],
    );
  }
  for (const row of ledger.rows) {
    if (row.reverses_ledger_id == null) continue;
    await club.query(
      `UPDATE cc_ledger SET reverses_ledger_id = $2 WHERE id = $1 AND reverses_ledger_id IS NULL`,
      [row.id, row.reverses_ledger_id],
    );
  }

  const requests = await dao.query("SELECT * FROM cc_requests ORDER BY id");
  for (const row of requests.rows) {
    await club.query(
      `INSERT INTO cc_requests (
         id, wallet_pubkey, amount, proof, status, kind, telegram_snapshot,
         admin_wallet, admin_notes, created_at, processed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.wallet_pubkey,
        row.amount,
        row.proof,
        row.status,
        row.kind,
        row.telegram_snapshot,
        row.admin_wallet,
        row.admin_notes,
        row.created_at,
        row.processed_at,
      ],
    );
  }

  const claims = await dao.query("SELECT * FROM legacy_cc_claims");
  for (const row of claims.rows) {
    await club.query(
      `INSERT INTO legacy_cc_claims (
         telegram_id, username, display_name, amount, originally_earned_at,
         redeemed_at, redeemed_by_wallet, notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [
        row.telegram_id,
        row.username,
        row.display_name,
        row.amount,
        row.originally_earned_at,
        row.redeemed_at,
        row.redeemed_by_wallet,
        row.notes,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  const proposals = await dao.query("SELECT * FROM proposals ORDER BY id");
  for (const row of proposals.rows) {
    await club.query(
      `INSERT INTO proposals (
         id, created_by_wallet, title, body, context, decision, type, status,
         created_at, closes_at, quorum_cc, yes_pct, result, executed_at, execution_tx_sig
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.created_by_wallet,
        row.title,
        row.body,
        row.context,
        row.decision,
        row.type,
        row.status,
        row.created_at,
        row.closes_at,
        row.quorum_cc,
        row.yes_pct,
        row.result,
        row.executed_at,
        row.execution_tx_sig,
      ],
    );
  }

  const votes = await dao.query("SELECT * FROM votes");
  for (const row of votes.rows) {
    await club.query(
      `INSERT INTO votes (proposal_id, wallet_pubkey, vote, weight_cc, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (proposal_id, wallet_pubkey) DO NOTHING`,
      [row.proposal_id, row.wallet_pubkey, row.vote, row.weight_cc, row.created_at],
    );
  }

  for (const table of ["cc_ledger", "cc_requests", "proposals"]) {
    await club.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${table}), 1))`,
      [table],
    );
  }

  await club.query(`
    CREATE OR REPLACE VIEW cc_balance AS
    SELECT wallet_pubkey, COALESCE(SUM(delta_cc), 0)::int AS cc
    FROM cc_ledger
    WHERE expires_at IS NULL OR expires_at > NOW()
    GROUP BY wallet_pubkey
  `);

  const before = await counts(dao);
  const after = await counts(club);
  console.log(JSON.stringify({ dao: before, club: after }));
  const keys = Object.keys(before);
  const mismatch = keys.filter((key) => before[key] !== after[key]);
  if (mismatch.length) {
    console.error(`Count mismatch: ${mismatch.join(", ")}`);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await dao.end().catch(() => undefined);
    await club.end().catch(() => undefined);
  });
