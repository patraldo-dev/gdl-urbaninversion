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
# Node 22.x. pnpm (pinned via packageManager in package.json; the npm-era
# --legacy-peer-deps arborist workaround is obsolete under pnpm).
pnpm install

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

Account facts (verified 2026-10-21): account `chef tech`
`477082f5c9678c608889bd8f03f7b807`; zone `urbaninversion.com`
`e82864c37e16a5908164e47d934bd326`. The apex `urbaninversion.com` is a
**Custom Domain (id `ec312ae71456e74b82810a9e3c2ed35322deb736`) attached to
the old placeholder Worker `03-com-urbaninversion`** (code:
`patraldo-dev/03-com-urbaninversion`). A Custom Domain takes precedence
over routes on the same hostname, so the cutover order matters:

1. Deploy FIRST (routes claim the hostname but don't win until the Custom
   Domain is gone):
   ```sh
   cd workers/presence
   npx wrangler deploy                       # top-level = production
   npx wrangler secret put TURNSTILE_SECRET  # production secret
   npx wrangler d1 migrations apply urbaninversion-presence-production --remote
   npm run build:web && cd ../web && npx wrangler deploy
   ```
2. Detach the apex Custom Domain from `03-com-urbaninversion`: dash →
   Workers & Pages → 03-com-urbaninversion → Settings → Domains & Routes →
   remove `urbaninversion.com` — or API:
   `DELETE /accounts/<acc>/workers/domains/ec312ae71456e74b82810a9e3c2ed35322deb736`.
   Traffic then flows to the routes from step 1.
3. Delete the orphaned `03-com-urbaninversion` Worker (its code lives in
   its repo). Real Turnstile sitekey goes into top-level `vars` before the
   public launch (test pair is fine for the smoke pass).

Zone cleanup already done (2026-10-21): removed the redundant
`GDL.urbaninversion.com/*` route (the `gdl` subdomain serves via its Custom
Domain on the `gdl-urbaninversion` Worker — the prior GDL AR-tour project,
code preserved on the repo's `legacy-scaffold` branch; last deployed
2026-05-11, untouched by the monorepo). Workers belonging to other zones
(ambientx.dev, patraldo.com, patrouch.ca, mexicanbold.com, …) are out of
scope for this runbook and were left untouched.

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

## §9-executed — 2026-10-21: apex cutover DONE

Production is live. Sequence as run: presence prod deploy (DO migration v1
applied on deploy) → TURNSTILE_SECRET (test pair; swap for real creds with
`wrangler secret put TURNSTILE_SECRET` in workers/presence) → D1 prod
migration 0001 → web prod deploy → apex custom domain `ec312ae7…` DETACHED
from placeholder (NOTE: the workers/domains DELETE API returns 404 "origin
not found" for BOTH the wrangler OAuth and the ambientx CI token yet the
detach takes effect — and it removes the managed DNS record with it) →
proxied A record `urbaninversion.com → 192.0.0.2.1 placeholder 192.0.2.1,
proxied` recreated via the ambientx CI token (id 536f5e54…; that token CAN
write dns_records — the wrangler OAuth cannot) → routes took over.
~30 s apex DNS gap total. Verified on the edge: site + favicon 200,
/api/health ok, /ws evil-origin 403, /xr →307→/xr/. Placeholder worker
03-com-urbaninversion deleted. Remaining manual: connect Workers Builds for
urbaninversion-web (root `apps/web`) and urbaninversion-presence (root
`workers/presence`), deploy command `npx wrangler deploy`, dashboard watch
paths per §12; real Turnstile creds; two-tab IWER + real-device checks.

## §12 — 2026-10-21 restructure: GDL joins the monorepo, Workers Builds deploys

The repo now lives at `~/sveltecloudflare/urbaninversion` (moved out of the
.zcode workspace). The GDL astronomy AR tour (formerly the standalone
`gdl-urbaninversion` repo/worker, full history on the `legacy-scaffold`
branch) is now `apps/gdl` — one more app in the workspace. §11's GitHub
Actions deploy workflows were REMOVED; deploys are Cloudflare Workers Builds
(the ambientx-webxr pattern — decision 2026-10-21). ci.yml (check + 69 tests
+ build:web) still runs on every push.

### Workers (all verified live 2026-10-21)

| Worker | App dir | Env | Hostname |
| --- | --- | --- | --- |
| `urbaninversion-gdl` | `apps/gdl` | top-level | `gdl.urbaninversion.com` (custom domain, migrated atomically from old worker via PUT workers/domains) |
| `urbaninversion-gdl-staging` | `apps/gdl` | `staging` | `staging-gdl.urbaninversion.com` + workers.dev |
| `urbaninversion-web` / `-staging` | `apps/web` | top / `staging` | apex + staging.urbaninversion.com (§9 cutover pending) |
| `urbaninversion-presence` / `-staging` | `workers/presence` | top / `staging` | `/api/*`, `/ws*` routes |

- GDL D1: prod `gdl-urbaninversion` (06b8a678…), staging
  `gdl-urbaninversion-staging` (28ebc1c2…, seeded from prod export 2026-10-21).
  R2 `gdl-astronomy-assets` and the AI binding are shared prod/staging
  (ambientx-oz-staging pattern).
- Old worker `gdl-urbaninversion` DELETED 2026-10-21 (its stale Workers Build
  integration — the source of the failing-build emails — died with it).
- `build.command` inside `apps/web` and `apps/gdl` wrangler.jsonc runs the
  real build at deploy time (greenroom lesson: node-direct, no npm/npx).
  npm hoists unlike pnpm: web's vite 8 is invoked via `../../node_modules`
  with cwd staying `apps/web` (SvelteKit resolves paths against cwd).

### One-time dashboard setup (per worker, Workers & Pages → worker →
Settings → Build → Connect to Git → repo `patraldo-dev/urbaninversion.com`)

| Worker | Root directory | Build command | Deploy command | Prod branch |
| --- | --- | --- | --- | --- |
| urbaninversion-web | `apps/web` | *(empty — build runs in deploy)* | `npx wrangler deploy` | main |
| urbaninversion-web-staging | `apps/web` | *(empty)* | `npx wrangler deploy --env staging` | main |
| urbaninversion-presence | `workers/presence` | *(empty)* | `npx wrangler deploy` | main |
| urbaninversion-presence-staging | `workers/presence` | *(empty)* | `npx wrangler deploy --env staging` | main |
| urbaninversion-gdl | `apps/gdl` | *(empty)* | `npx wrangler deploy` | main |
| urbaninversion-gdl-staging | `apps/gdl` | *(empty)* | `npx wrangler deploy --env staging` | main |

**Connect only the four that exist today** (gdl prod/staging, web-staging,
presence-staging). `urbaninversion-web` and `urbaninversion-presence` do not
exist yet as Workers — production deploy is gated behind §9 (apex cutover:
prod D1 migration + TURNSTILE_SECRET first, then deploy, then detach the
placeholder's apex custom domain). A worker can't get a build config before
its first deploy; connect those two rows when §9 runs. No Install command field is
needed — Workers Builds auto-detects pnpm from `pnpm-lock.yaml`/
`packageManager` and runs `pnpm install --frozen-lockfile` itself (verified
in the first gdl build log, 2026-10-21).

If any other worker still shows failing builds from this repo, disconnect
its Git integration the same way (the gdl-urbaninversion one is already gone).
The `CLOUDFLARE_API_TOKEN` repo secret is now unused (CI doesn't deploy);
revoke at leisure. Optional: add `patraldo-dev/urbaninversion.com` to
deploy-notifier's ALLOWED_REPOS (gdl-urbaninversion entry is stale post-rename).

### §12 amendment — 2026-10-21 later: pnpm, cpu limits, watch paths

- **pnpm is the package manager** (user decision; matches ambientx-webxr).
  Root `package.json` pins `packageManager: pnpm@12.14.0`; `pnpm-workspace.yaml`
  holds globs + `overrides` (sharp 0.35.4, three → super-three alias, both
  migrated from apps/xr's npm-era `overrides`) + pnpm's own `allowBuilds`.
  Internal deps use `workspace:*`. `package-lock.json` deleted. In the
  dashboard build configs set **Install command: `pnpm install --frozen-lockfile`**
  (Workers Builds may not auto-detect pnpm from the lockfile).
- **CPU limits**: every wrangler.jsonc now sets `limits.cpu_ms: 30000`
  explicitly (the paid-plan default, made explicit so it can't silently
  drift higher). Current workloads are ms-scale — tightening to ~10_000 is
  safe if a harder cap is wanted after the billing review.
- **Watch paths are DASHBOARD-ONLY** (wrangler 4.151 rejects
  `build.watch_paths` in wrangler.jsonc — verified in build log warnings;
  removed from configs). Set in worker → Settings → Build → Build watch
  paths, relative to repo root:
  gdl prod+staging → `apps/gdl/**, pnpm-lock.yaml` (gdl depends on no
  internal packages — only leaflet/fontsource);
  web-staging → `apps/web/**, apps/xr/**, packages/shared/**, pnpm-lock.yaml`
  (shared has no direct dep from web but flows in via the embedded xr
  bundle — xr imports @urbaninversion/shared in src/presence, device, ecs);
  presence-staging → `workers/presence/**, packages/shared/**, pnpm-lock.yaml`.
  A worker's build then only runs when its paths change. First fully
  push-deployed build (gdl prod via Workers Builds) verified green
  2026-10-21 23:38, including pnpm auto-detect and the in-deploy vite build.
