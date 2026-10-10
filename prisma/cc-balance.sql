CREATE OR REPLACE VIEW cc_balance AS
SELECT wallet_pubkey, COALESCE(SUM(delta_cc), 0)::int AS cc
FROM cc_ledger
WHERE expires_at IS NULL OR expires_at > NOW()
GROUP BY wallet_pubkey;
