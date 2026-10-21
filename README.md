# Urban Inversion

urbaninversion.com — a pro-social presence layer for eyeglass wearers: see
nearby people who are OPEN to an in-person conversation or QUIET (please
don't approach), as you walk. Privacy-first: no faces, no cameras, no names,
no persistent identity, no stored location history. Positions live only in
Durable Object memory; D1 stores k-anonymized counts.

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `packages/shared` | `@urbaninversion/shared` | Types, config, schemas, validation, geo math, quantization. Device-agnostic by contract. |
| `workers/presence` | `@urbaninversion/presence` | Worker + `PresenceCell` Durable Object (WebSocket Hibernation, alarms) + D1 flush. |
| `apps/web` | SvelteKit | Marketing/info site on Workers Static Assets; serves `/` and hosts the XR bundle at `/xr`. |
| `apps/xr` | IWSDK app | XR client. Scaffolded with `npm create @iwsdk@latest`; device logic behind a `DeviceProfile` adapter (Meta VR Glasses + Simulated). |
| `apps/gdl` | `@urbaninversion/gdl` | GDL astronomy AR tour on `GDL.urbaninversion.com` (worker `urbaninversion-gdl`, staging `urbaninversion-gdl-staging` on `staging-gdl.urbaninversion.com`). Imported 2026-10-21 from the standalone `gdl-urbaninversion` repo; its full history lives on the `legacy-scaffold` branch. |

## Language

JSDoc-typed JavaScript everywhere: plain `.js` with `// @ts-check` semantics
enforced through `checkJs` + the full strict flag set in `tsconfig.base.json`
(the single strictness source — `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, …). Exception: `apps/xr` follows whatever the
IWSDK scaffold emits; if that scaffold is TypeScript-only, that app stays
TypeScript while the rest of the monorepo remains JSDoc-JS.

## Commands

```sh
pnpm install              # at repo root (pnpm workspace; pnpm-workspace.yaml)
pnpm build                # all workspaces, in dependency (topological) order
pnpm test                 # Vitest: validation, quantization, k-anonymity, DO + simulation harness
pnpm build:web            # xr build → copy into web static → web build
```

pnpm runs workspace scripts in topological order, so `@urbaninversion/shared`
is always built before its consumers. Internal deps use the `workspace:*`
protocol. The npm-era `--legacy-peer-deps` workaround is gone (npm's
arborist crashed on this tree; pnpm resolves it cleanly).

## Environments

Each wrangler config uses **production as the top-level environment** and a
named `staging` environment that overrides Worker name, routes, D1
`database_id` and vars. Staging and production therefore deploy as separate
Workers with separate Durable Object namespaces and separate D1 databases —
nothing is shared. Local dev runs `wrangler dev --env staging` (staging vars
include the localhost origins used by the XR dev server).

Routing (zone `urbaninversion.com`, Workers Routes only, no Custom Domains):

- `urbaninversion.com/*` → web Worker (static assets + SvelteKit)
- `urbaninversion.com/api/*`, `urbaninversion.com/ws` → presence Worker (more specific route wins)
- same split on `staging.urbaninversion.com`

See `docs/deployment-runbook.md` (Phase 2g) for exact commands.

## Future surfaces (decided, not yet built)

- **ambientx.dev** will become the developer/docs/open-source surface while
  urbaninversion.com stays the consumer destination. Nothing in v1 depends on
  it. When it arrives it needs: a Cloudflare zone with a proxied DNS record,
  routes (its own docs Worker or a redirect), an `ORIGIN_ALLOWLIST` entry in
  the presence Worker if the XR app is ever served from it, and a runbook
  step. Recorded here so the decision survives.
- **Open geospatial standards** (OARC GeoPose / spatial service discovery)
  are watchlist items, not dependencies. The protocol already speaks a W3C
  DID method (`did:key`, P-256) for message integrity and per-session
  pseudonymity — nothing more is claimed, because no shipping device OS
  resolves DIDs. v1 never anchors users in world coordinates, so
  world-anchored standards replace nothing we depend on.
- The glasses client is a plain URL-hosted web app: added on-device via the
  Meta AI app in Developer Mode (URL / deeplink / QR). Hosting is therefore
  domain-agnostic by design.
- **The open "ambient presence" end-state** (cross-vendor, no shared app): a
  spatial service registry any device can query (OSCP-style discovery) plus
  ephemeral DID documents carrying a tiny status payload. The standards are
  real but early — GeoPose (OGC) and DID Resolution v1 (W3C CR, Aug 2026,
  inviting implementations) — and no shipping device OS runs any of it
  natively. It is the multi-vendor destination, not a v1 dependency. Two
  properties must carry over if it ever lands: (1) records stay ephemeral,
  signed by per-session `did:key`, carrying no identity; (2) mutual
  visibility — an open, anonymously-readable registry cannot enforce
  "readers must be visible," so the safety guarantees the mediated server
  provides (mutual visibility, quantized relative vectors, k-anonymity)
  would have to be re-solved, not assumed. A v2 can approximate the
  "ambient business card" today by serving ephemeral DID documents from
  `/api` for clients of this app; publishing to an open registry becomes an
  adapter on `workers/presence` with no changes to `packages/shared` or the
  XR client.
