# Purple Club

Decentralized discount network for the PBTC community, built on Next.js 16 + Solana read-only auth.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000> to see the app.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values you need. Production values are configured on Vercel.

### v1 (current)

| Variable                          | Purpose                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GITHUB_BOT_PAT`                  | Classic GitHub PAT with `repo` scope. Lets the relay open issues on the merchant repo.         |
| `GITHUB_REPO`                     | `owner/name` of the repo that receives merchant issues and PRs.                                |
| `JWT_SIGNING_SECRET`              | 32+ char random string. Signs merchant edit tokens (HS256).                                    |
| `TURNSTILE_SECRET_KEY`            | Cloudflare Turnstile server secret.                                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`  | Cloudflare Turnstile client site key.                                                          |
| `PURPLE_CLUB_ORIGIN`              | Origin used by `scripts/generate-edit-token.ts` (defaults to `https://purpleclub.xyz`).        |
| `NEXT_PUBLIC_SOLANA_RPC_URL`      | Optional Solana RPC. Falls back to `clusterApiUrl("mainnet-beta")`.                            |

### Future: enabling email (v1.1)

v1 intentionally ships without email. When merchant lost-link DMs exceed ~2/week, re-enable email as a **single additive change**:

1. `npm install resend`
2. Add `RESEND_API_KEY` on Vercel + `.env.local`.
3. Add one `resend.emails.send(...)` block in `app/api/submit-merchant/route.ts` right before the final response.
4. Add `app/api/merchant-magic-link/route.ts` that wraps `scripts/generate-edit-token.ts` logic.
5. Swap the "DM us on Telegram/X" block in `app/merchant/edit/page.tsx` with an email input that POSTs to the new route.

No data migration, no schema changes — all email-related fields are already collected and persisted in the GitHub Issue body.

## Merchant onboarding flow (zero-database)

1. Merchant fills `/join` → captcha → Submit.
2. `/api/submit-merchant` (Edge) creates a GitHub Issue tagged `pending-review` and signs a HMAC edit token.
3. Merchant lands on `/merchant/submitted` with a bookmarkable edit URL they must save (copy / download as text).
4. A maintainer reviews the issue. Adding the `approved` label triggers `.github/workflows/merchant-approve.yml` which:
   - verifies the sender is in the maintainer allowlist,
   - parses the issue with `stefanbuck/github-issue-parser`,
   - validates URLs, category, slug uniqueness, etc.,
   - runs `scripts/apply-merchant-change.ts` to mutate `data/merchants.json`,
   - opens a PR via `peter-evans/create-pull-request`.
5. Maintainer merges → Vercel redeploys → merchant is live.

### Edit / remove

Merchants bookmark the edit link from `/merchant/submitted`. Opening `/merchant/edit?t=<token>` prefills their record for update or removal. Both paths create new GitHub Issues (`[Merchant Update]` / `[Merchant Removal]`).

### Lost-link recovery (manual, v1)

Merchant DMs `@purpleclubhq` on Telegram or `@purpleclub` on X with the email they submitted. A maintainer runs:

```bash
npx tsx scripts/generate-edit-token.ts owner@goldsgym.com golds-gym https://purpleclub.xyz
```

...and DMs the freshly signed URL back. The secret is read from `.env.local`.

### Maintainer allowlist

`MERCHANT_APPROVERS` (repo secret, comma-separated GitHub logins) controls which accounts can trigger the approval workflow. Falls back to the repo owner if unset.

## Regenerating city data

`data/cities.ts` is generated from the GeoNames `cities15000` dump.

```bash
# 1. Download the source files into data/_cache (gitignored).
Invoke-WebRequest https://download.geonames.org/export/dump/cities15000.zip -OutFile data/_cache/cities15000.zip
Invoke-WebRequest https://download.geonames.org/export/dump/countryInfo.txt -OutFile data/_cache/countryInfo.txt
Expand-Archive data/_cache/cities15000.zip -DestinationPath data/_cache -Force

# 2. Regenerate data/cities.ts
npx tsx scripts/generate-cities-data.ts
```

GeoNames data is CC BY 4.0 — see attribution in `data/cities.ts`.

## Scripts

| Command                                       | Purpose                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                                 | Start the local dev server.                                            |
| `npm run build`                               | Production build.                                                      |
| `npm run lint`                                | ESLint.                                                                |
| `npx tsx scripts/apply-merchant-change.ts`    | Invoked by the approval workflow. Usable locally for testing.          |
| `npx tsx scripts/generate-edit-token.ts`      | Manual merchant lost-link recovery.                                    |
| `npx tsx scripts/generate-cities-data.ts`     | Regenerate `data/cities.ts` from the GeoNames dump.                    |

## Project layout

- `app/` — Next.js App Router routes.
- `app/api/submit-merchant/route.ts` — Edge relay that creates GitHub issues.
- `components/` — UI components.
- `data/merchants.json` — source of truth for the merchant directory. Only modified by the approval workflow.
- `data/merchants.ts` — thin typed loader over `merchants.json`. Preserves the public `merchants`, `Merchant`, `MerchantCategory`, `MERCHANT_CATEGORIES` API.
- `lib/merchantSchema.ts` — shared Zod schemas for submission + persisted shapes.
- `lib/editToken.ts` — `jose` HMAC sign/verify for merchant edit tokens.
- `scripts/` — Node/tsx scripts used by the workflow and for manual recovery.
- `.github/workflows/merchant-approve.yml` — the approval automation.
- `.github/ISSUE_TEMPLATE/merchant_submission.yml` — GitHub issue form (field ids must match the Zod schema keys).
