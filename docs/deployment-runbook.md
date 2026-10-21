# Urban Inversion — Deployment Runbook

Staging first. Production only after every staging smoke test passes.
Nothing in this document contains real secrets — placeholders only.

- Staging: `https://staging.urbaninversion.com` (site `/`, XR `/xr/`, API `/api/*`, WebSocket `/ws`)
- Production: `https://urbaninversion.com` (same layout)
- Routing model: **Workers Routes only, no Custom Domains.** The web Worker
  owns `<host>/*`; the presence Worker owns `<host>/api/*` and `<host>/ws`
  (more specific patterns win). Both hostnames need a proxied DNS record.

---

## 0. One-time prerequisites

```sh
# Node 22.x. Installs need --legacy-peer-deps (npm 10 arborist crashes on
# this dependency tree otherwise — verified 2026-10-20).
npm install --no-audit --no-fund --legacy-peer-deps

# Authenticate wrangler (opens browser), then confirm the account that
# holds the urbaninversion.com zone:
npx wrangler login
npx wrangler whoami

# Gate: everything green before any deploy
npm run check          # tsc (shared+workers) + svelte-check (web)
npm test               # 69 tests: 50 shared + 19 workers (real DOs)
npm run build:web      # xr build → copy into web static → web build
```

Secret inventory (values live only in the Cloudflare dash / your password
manager / `wrangler secret put` prompts):

| Name | Where | Notes |
| --- | --- | --- |
| `TURNSTILE_SECRET` | presence Worker secret, per env | From the Turnstile widget in the dash. Before real creds exist, the documented Cloudflare **test secret** `1x0000000000000000000000000000000AA` works end-to-end with the dummy token. |
| `TURNSTILE_SITEKEY` | presence Worker **var** (wrangler.jsonc, per env) | Public. Pre-launch you may use the test sitekey `1x00000000000000000000AA`. |
| D1 `database_id` ×2 | wrangler.jsonc | Printed by `wrangler d1 create` in §2. |

## 1. Fill the placeholders in `workers/presence/wrangler.jsonc`

- `REPLACE_WITH_STAGING_D1_ID` (after §2)
- `REPLACE_WITH_PRODUCTION_D1_ID` (after §2 — safe to fill now, deploy happens later)
- `REPLACE_WITH_TURNSTILE_SITEKEY` (top-level vars and `env.staging.vars`)

## 2. Create the D1 databases (one per environment, never shared)

```sh
npx wrangler d1 create urbaninversion-presence-staging
# → copy "database_id" into env.staging.d1_databases[0].database_id

npx wrangler d1 create urbaninversion-presence-production
# → copy into top-level d1_databases[0].database_id
```

## 3. DNS records (Cloudflare dash → zone urbaninversion.com → DNS)

Workers Routes only carry traffic on **proxied** hostnames.

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `staging` | `192.0.2.1` (placeholder — content is never served) | **Proxied (orange)** |
| A | `@` | (already exists for the placeholder site) | Proxied |

Production DNS needs no change; §9 detaches whatever currently answers.

## 4. Deploy the presence Worker — staging

```sh
cd workers/presence
npx wrangler deploy --env staging
```

- First deploy runs the DO migration (`new_sqlite_classes`: PresenceCell,
  MetricsRollup) — watch for it in the output. `// VERIFY` resolved on
  success; if wrangler rejects the migration shape, stop and fix before
  proceeding.
- Output must list routes `staging.urbaninversion.com/api/*` and
  `staging.urbaninversion.com/ws`, and the Worker name
  `urbaninversion-presence-staging` (its own DO namespace — isolated from
  production by construction).

Secrets require an existing Worker, so this order matters:

```sh
npx wrangler secret put TURNSTILE_SECRET --env staging
```

## 5. Migrate D1 — staging

```sh
cd workers/presence
npx wrangler d1 migrations apply urbaninversion-presence-staging --env staging --remote
# verify:
npx wrangler d1 execute urbaninversion-presence-staging --env staging --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
# expect: d1_migrations, presence_metrics
```

## 6. Deploy the web Worker — staging

```sh
# from repo root (build includes the /xr bundle)
npm run build:web
cd apps/web
npx wrangler deploy --env staging
```

Output must show route `staging.urbaninversion.com/*`, Worker name
`urbaninversion-web-staging`, and the static-assets upload.

## 7. Cloudflare Access on staging (recommended)

Zero Trust → Access → Applications → add a self-hosted app for
`staging.urbaninversion.com` with your team's policy (e.g. email OTP).

Device-testing bypass: the glasses browser cannot complete an Access login.
During device smoke tests, add a **Bypass** rule scoped to the paths the
device needs — `/xr*`, `/api/*`, `/ws` — and remove it afterwards. The
marketing pages stay protected; the XR surface keeps Turnstile + Origin
checks either way. (WebSockets would authenticate fine with the Access
cookie, but the glasses runtime can't earn one.)

## 8. Staging smoke checklist — all must pass

```sh
BASE=https://staging.urbaninversion.com
```

1. Site pages 200: `/`, `/how-it-works`, `/privacy`, `/enter`, `/pair`.
2. Staging noindex on site HTML: `curl -sI $BASE/ | grep -i x-robots-tag` →
   `noindex, nofollow`.
3. XR bundle served by the assets layer: `curl -sI $BASE/xr/` → 200 with
   `x-robots-tag: noindex` (from `_headers`); one hashed asset under
   `/xr/assets/` also 200. Also check `curl -sI $BASE/xr` — with
   `html_handling: auto-trailing-slash` both forms must work (`// VERIFY`
   from Phase 2a — this is where it gets answered; site links use `/xr/`).
4. Presence API: `curl -s $BASE/api/health` → `{"ok":true,...}`;
   `curl -s $BASE/api/config` → JSON incl. `turnstileSitekey`.
5. Origin enforcement on the WebSocket:
   ```sh
   curl -si -N "$BASE/ws?cell=u33d8v" \
     -H "Origin: https://evil.example" \
     -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
     | head -1        # expect HTTP/2 403
   ```
   Repeat with `-H "Origin: https://staging.urbaninversion.com"` → expect
   `101`.
6. End-to-end presence: open `https://staging.urbaninversion.com/enter` in
   two desktop browser tabs, complete consent, Enter XR (IWER), set both to
   Open. Each tab should show one OPEN marker at a plausible
   direction/distance bucket. Toggle one tab to Invisible → the marker in
   the other tab disappears within seconds (zero server state).
7. Isolation from production: only `*-staging` Workers exist so far:
   `npx wrangler deployments list --env staging` inside both packages;
   production D1 has no tables yet (`... --command` from §5 against the
   production DB name must fail or show nothing pre-§9).
8. Laptop dev path still works: `cd apps/xr && npm run dev` with the
   `metaVRGlasses` IWER profile and the simulated walker (`?device=simulated`).
9. Real-device pass (the target UX): Meta AI app on the glasses →
   Developer Mode → App Settings → App connections → Add a Web App →
   `https://staging.urbaninversion.com/xr/` (or scan a QR for that URL).
   Confirm consent panel, state toggle, Band/captouch selection, and the
   HUD layout on the monocular display.

## 9. Production — only after §8 passes end-to-end

1. **Detach the current placeholder** on `urbaninversion.com`. Find it:
   `npx wrangler pages project list` (if it's a Pages project → dash →
   Pages → the project → Custom domains → remove `urbaninversion.com`),
   else dash → Workers Routes / Custom Domains → delete whatever claims
   `urbaninversion.com/*`. The zone's proxied root DNS record stays.
2. Real Turnstile widget for `urbaninversion.com` → put the **sitekey** in
   top-level `vars` of `workers/presence/wrangler.jsonc`, then:
   ```sh
   cd workers/presence
   npx wrangler deploy                       # top-level = production
   npx wrangler secret put TURNSTILE_SECRET  # production secret
   npx wrangler d1 migrations apply urbaninversion-presence-production --remote
   ```
3. Web: `npm run build:web && cd apps/web && npx wrangler deploy`.
4. Routes created by the deploys: `urbaninversion.com/api/*` + `/ws`
   (presence), `urbaninversion.com/*` (web).

Production smoke: repeat §8 items 1, 3–6 with
`BASE=https://urbaninversion.com` — **except** item 2 inverted: site HTML
must NOT carry `x-robots-tag` (`/xr/*` keeps its noindex by design).

## 10. Rollback & operational notes

- `npx wrangler deployments list` / `npx wrangler rollback` in either
  package (instant code rollback; assets roll back with the deployment).
- Local dev of the presence stack: `cd workers/presence && npm run dev`
  (wrangler dev on staging env, `.dev.vars` copied from
  `.dev.vars.example`), and `cd apps/xr && npm run dev` for the client.
- Cost floor (Phase 1 estimate): ≈ **$4.14/month per concurrently-active
  cell Durable Object** (128 MB always-on) + negligible request charges;
  sparse cells hibernate and cost ~nothing.
- Deploy-time config drift: `npm run check` + `npm test` before every
  deploy; the DO test suite catches registration/signature/handoff breaks
  that only appear at runtime.

## 11. CI/CD — GitHub → Cloudflare

Repo: `github.com/patraldo-dev/urbaninversion.com` (main = this monorepo;
the previous GDL AR-tour project is preserved on the `legacy-scaffold`
branch). Three workflows in `.github/workflows/`:

- **CI** — every push to `main` and every PR: typecheck, 69 tests, full
  build. No Cloudflare credentials needed.
- **Deploy — staging** — push to a `staging` branch or manual dispatch:
  check → test → build → `wrangler deploy --env staging` (presence), D1
  migrations, `wrangler deploy --env staging` (web).
- **Deploy — production** — manual dispatch only, tied to the GitHub
  `production` environment (add required reviewers in repo Settings →
  Environments for an approval gate).

One-time setup in GitHub (repo Settings → Secrets and variables → Actions):

1. `CLOUDFLARE_API_TOKEN` — create in the Cloudflare dash (My Profile →
   API Tokens) with scopes: **Account → Workers Scripts: Edit**,
   **Account → D1: Edit**, **Zone (urbaninversion.com) → Workers Routes:
   Edit**, **Account → Account Settings: Read**.
2. `CLOUDFLARE_ACCOUNT_ID` — dash overview, right sidebar.

`TURNSTILE_SECRET` deliberately never enters CI — set it once per
environment with `wrangler secret put` (§4/§9). Note the first CI staging
deploy still requires runbook §1–§3 done (real D1 ids in `wrangler.jsonc`,
the DNS record) — until then the workflow will fail at the deploy step by
design. Alternative considered: Cloudflare Workers Builds (dash-side repo
connection) — works, but the monorepo's cross-package pipeline
(xr build → copy → web build) is cleaner in the Actions workflows.
