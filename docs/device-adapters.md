# Device adapters

Urban Inversion is a device-agnostic presence system: the presence worker
and `packages/shared` contain **no device-specific rendering logic**. Each
client declares capabilities and renders shared **render intents**.

## Architecture

```
workers/presence ── knows people/cells/privacy, nothing about devices
packages/shared ── protocol + DeviceProfile + render-intents (pure)
packages/presence-client ── browser runtime (WS client, providers, store, wake lock, audio)
apps/web (/hub) ── phone hub (v1 product client)
apps/web (/glasses-meta) ── Meta Ray-Ban Display HUD adapter
apps/xr ── FROZEN spatial client (Meta VR Start competition artifact)
```

## Capability model

Every client sends a `dev` block in its `hello` frame
(`packages/shared/src/device-profile.js`):

```ts
type DeviceProfile = {
  clientId: string;                          // per-session random, never persisted
  display: 'none' | 'text' | 'hud2d' | 'spatial';
  audio: boolean;
  headingSource: 'none' | 'compass' | 'gps-course' | 'manual';
  locationSource: 'none' | 'gps' | 'manual' | 'paired-phone';
  locale: string;
};
```

The server validates the shape and otherwise ignores it. The privacy
invariants are unchanged: rotating handles, bucketed distance/bearing, no
raw coordinates, OBSERVER → aggregates only, INVISIBLE → disconnect.

## Render intents

`packages/shared/src/render-intents.js` converts the privacy-safe facts
into device-neutral outputs (`text_line`, `speech`, `arrow`,
`ambient_summary`), localized for en/es/fr. Directions are body-relative
and are `'unknown'` when the client has no heading — a direction is never
invented. Clients pick the intents their profile can render.

## Adding a client

1. Depend on `@urbaninversion/presence-client` (browser runtime) or just
   `@urbaninversion/shared` (protocol only).
2. Run the pre-session consent/Turnstile page (or embed the widget, as
   `/glasses-meta` does) — the hello frame requires a Turnstile token.
3. `bootstrapPresence({ profileId, devOverrides })`, subscribe to
   `presenceStore`, render `markerIntents`/`aggregateIntent` output.
4. Handle: geolocation denied/unavailable, WebSocket reconnect (automatic;
   call `service.resume()` on `visibilitychange`→visible), and INVISIBLE =
   disconnect.

## Adapter status

| Adapter | Path | Status |
|---|---|---|
| Phone hub | `apps/web` `/hub` | v1 product client |
| Tethered display glasses | mirror `apps/web` (any viewer) | works via the phone hub UI |
| Meta Ray-Ban Display | `apps/web` `/glasses-meta` (source `apps/glasses-meta`) | built; on-device pass pending |
| Even Realities G2 | — | planned: Even Hub package (`@evenrealities/even_hub_sdk`), NOT a web app |
| Android XR / Snap Specs | — | docs-only future adapters; `apps/xr` is the natural spatial base |

## Venue autopopulate (OSM)

Opening the place card geolocates once and merges two sources: rooms
already in our registry (/api/places/nearby) plus named venues from
OpenStreetMap queried DIRECTLY from the browser (Overpass is CORS-open;
it 521s Cloudflare-Workers egress, so no worker proxy — the phone's
residential IP is the right client). One tap creates the room from the
venue's own coordinates (idempotent create-dedupe) and joins. Attribution
per ODbL shown in the UI. Mirrors tried in order with 9 s timeouts;
empty results fall back to name-it-yourself.

## Phone→glasses pairing (the glasses never runs a challenge)

Turnstile challenges are awkward on a 600×600 D-pad display, so glasses
sessions borrow a phone's human check:

1. The glasses page calls `POST /api/pair/code` and displays a 6-char
   code (5-min TTL, no ambiguous glyphs; per-IP + global caps).
2. The phone (already in `/hub`) opens **Pair your glasses**, types the
   code, and taps Pair. The hub fetches a FRESH Turnstile token and
   POSTs `/api/pair/vouch {code, turnstile}` — the worker siteverifies
   the token, then the pairing DO mints a single-use `pt_…` ticket
   (10-min TTL) for that code.
3. The glasses polls `GET /api/pair/status?code=…`; on `granted` it
   receives the ticket and keeps it in sessionStorage.
4. Its `hello` frame carries `pair` (the ticket) instead of
   `turnstile` — strictly XOR on the wire — and PresenceCell consumes
   the ticket atomically in the pairing DO.

Threat model: the ticket is bearer proof that a human solved Turnstile
on this origin minutes ago — one ticket per code, single-use,
short-TTL, nothing persisted (a DO restart drops pending codes; users
retry). State lives in one global `PairingDO` (id_from_name), all
in-memory.

## Background behavior (the honest limit)

Mobile browsers freeze backgrounded pages (Chrome Android after ~1 min,
iOS Safari within seconds of backgrounding/locking): timers, geolocation,
and WebSockets all stop. The phone hub is therefore a **foreground /
screen-on presence client**:

- a Screen Wake Lock is held while presence is active (where supported);
- the UI says "keep this screen on to remain discoverable";
- on `visibilitychange`→visible the service refreshes position and the
  sockets reconnect with their existing backoff.

True pocket/screen-off presence requires a native shell (Phase 3):
Android foreground service + FUSED location + persistent notification;
iOS background-location permission with significant-location-change
wakeups. Not built in this phase.
