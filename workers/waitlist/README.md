# focx.ai waitlist Worker

Self-contained Cloudflare Worker + D1 backend for `POST /api/waitlist`. Lives in `workers/waitlist/` so it does not collide with `apps/site`.

Do **not** deploy, merge, or attach a `focx.ai` route from this PR. Ryan approves before anything ships.

## Endpoint contract

`POST /api/waitlist`  
`Content-Type: application/json`  
Body: `{ "email": string, "website": string }`

`website` is a honeypot. It must be empty or absent.

| Condition | Status | Body |
| --- | --- | --- |
| Valid new email | 200 | `{"ok":true}` |
| Duplicate email | 200 | `{"ok":true}` (same as new; does not reveal membership) |
| Honeypot filled | 200 | `{"ok":true}` (nothing stored) |
| Invalid or missing email | 400 | `{"ok":false,"error":"invalid_email"}` |
| Wrong `Content-Type` or malformed JSON | 400 | `{"ok":false,"error":"bad_request"}` |
| Body over 1024 bytes | 413 | `{"ok":false,"error":"too_large"}` |
| Rate limited | 429 | `{"ok":false,"error":"rate_limited"}` + `Retry-After` |
| Browser origin not allowed | 403 | `{"ok":false,"error":"forbidden_origin"}` |
| Unexpected failure (for example D1) | 5xx | `{"ok":false,"error":"server_error"}` (no internals) |
| Other methods on this path | 405 | `Allow: POST, OPTIONS` |
| `OPTIONS` | 204 | CORS preflight |
| Unknown path | 404 | `{"ok":false,"error":"not_found"}` |

Validation: trim, lowercase, 254-character cap, one `@`, ASCII local/domain with a real TLD. Dedup is enforced in D1 (`UNIQUE` on `email`, `INSERT … ON CONFLICT DO NOTHING`).

No cookies. No email sending. Stored columns are only `id`, `email`, `created_at`.

### CORS

Allowed automatically:

- Requests with no `Origin` (curl, same-origin that omit it)
- Same-origin (`Origin` equals the request URL origin) — covers `focx.ai/api/waitlist` once routed, and workers.dev hosts calling themselves

Production also allows exactly `https://focx.ai` and `https://www.focx.ai`.

`EXTRA_ALLOWED_ORIGINS` is a comma-separated env var of extra exact origins and/or **fully anchored** regexes (`^…$`). Regexes are compiled once per distinct env value and must match the entire origin. Request `Origin` is never compiled as a regex.

Preview default:

```
^https://focx-site-preview(-[a-z0-9]+)?-pr-[0-9]+\.onrender\.com$,http://localhost:8123,http://127.0.0.1:8123
```

Localhost entries belong only in preview/dev. Never put them in the production allowlist.

CORS headers: `POST` and `OPTIONS` only. No `Access-Control-Allow-Credentials`.

### Rate limiting

Cloudflare Workers Rate Limiting binding (`WAITLIST_RATE_LIMITER`), 10 calls / 60 seconds / colo, keyed on `cf-connecting-ip`. Counters stay in Cloudflare's in-memory limiter; this Worker does not persist IP, user-agent, referrer, country, or any fingerprint, and does not log them or the email.

The Rate Limiting binding docs and GA announcement do not mark it paid-only (unlike Durable Objects or some Workers AI models). It is used here because it is available on the Workers Free plan and stores no personal data in D1.

## Environments

| | Production (top-level) | `preview` |
| --- | --- | --- |
| Worker name | `focx-waitlist` | `focx-waitlist-preview` |
| `workers_dev` | `true` | `true` |
| D1 | `focx-waitlist` (placeholder id) | `focx-waitlist-preview` (placeholder id) |
| Extra origins | empty (focx.ai + www only) | Render preview regex + localhost:8123 |
| Routes | commented out (`focx.ai/api/waitlist*`) | none, and none should be added |

`preview_database_id` is set on the production D1 binding so `wrangler dev --remote` uses the preview database, not prod. The preview env uses a named local `preview_database_id` (`local-focx-waitlist-preview`).

**Version URLs from `wrangler versions upload` reuse the deployed Worker's bindings** ([Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/), [Compare workflows](https://developers.cloudflare.com/workers/previews/compare-workflows/)). A Version URL is an uploaded version of that Worker with that Worker's production resources — it does not isolate D1.

Deploy previews only to the preview env:

```bash
npx wrangler deploy --env preview
```

Top-level `wrangler deploy` (production) should pass `--env=""` so Wrangler does not guess an environment. Never use `wrangler versions upload` on `focx-waitlist` for a preview.

Never run `wrangler versions upload` (or `wrangler deploy`) against the production Worker for a preview. That would share the production D1 table.

Previews stay on `*.workers.dev`. No route or custom domain on the focx.ai zone for preview.

The production route `focx.ai/api/waitlist*` stays commented out. focx.ai is proxied through Cloudflare, so enabling that route would answer even while the page origin is suspended. Uncomment it only in the launch PR Ryan approves.

## Local development

```bash
cd workers/waitlist
npm install
npm test
npx wrangler dev --env preview
```

`npm run dev` is the same as `wrangler dev --env preview` (localhost origins allowed, preview D1).

Apply migrations to the local preview DB:

```bash
npx wrangler d1 migrations apply focx-waitlist-preview --local --env preview
```

## Create D1 databases and apply migrations (after Ryan approves)

Do not run these in this PR. They create Cloudflare resources.

1. `npx wrangler d1 create focx-waitlist`
2. `npx wrangler d1 create focx-waitlist-preview`
3. Put the real ids into `wrangler.jsonc`:
   - Production `database_id` ← focx-waitlist
   - Production `preview_database_id` ← focx-waitlist-preview
   - Preview env `database_id` ← focx-waitlist-preview
4. Apply migrations:
   - `npx wrangler d1 migrations apply focx-waitlist-preview --remote --env preview`
   - `npx wrangler d1 migrations apply focx-waitlist --remote` (production, launch only)

## Deploy checklist (not part of this task)

Only after Ryan approves a launch PR:

1. Confirm placeholder `database_id` / `preview_database_id` values were replaced.
2. Confirm production `EXTRA_ALLOWED_ORIGINS` is empty and does not include localhost.
3. Deploy preview first: `npx wrangler deploy --env preview` (never `versions upload` on prod).
4. Smoke-test the workers.dev preview URL from an allowed Render preview origin.
5. Apply production D1 migrations.
6. Deploy production: `npx wrangler deploy` (still without the focx.ai route until the launch PR).
7. In the launch PR only: uncomment `routes` for `focx.ai/api/waitlist*` and deploy.

## Privacy

Draft policy: collect only the email address; no analytics, cookies, tracking, or third-party services; minimum age 13.

This Worker persists `id`, normalized `email`, and `created_at` only. The policy placeholders `[[HOSTING PROVIDER]]` and `[[EMAIL / WAITLIST PROVIDER]]` would both be **Cloudflare** (Workers + D1) if this ships.

Workers Logs / traces are enabled for operational debugging. Application code does not write email, IP, or other request identifiers to `console`. Platform request logs may still record edge metadata (for example connecting IP). If that conflicts with the published policy, disable observability before launch.

## Tests

`npm test` runs Vitest inside workerd via `@cloudflare/vitest-plugin` (current successor to `@cloudflare/vitest-pool-workers`) with a local D1 and the checked-in migrations.
