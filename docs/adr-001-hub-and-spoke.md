# ADR 001: Hub-and-spoke presence, not a phone app with glasses support

Date: 2026-10-23 · Status: accepted

## Context

Urban Inversion must work across the phone→glasses transition: phones
today, audio glasses (Ray-Ban Meta audio, AirPods), tethered display
glasses (XREAL/Viture/RayNeo mirroring), HUD glasses (Meta Ray-Ban
Display first, Even G2 later), and eventually spatial glasses (Android XR,
Snap Specs). An earlier framing — "phone as the durable hub" — risks
baking the phone into the architecture.

## Decision

The architecture is **the server protocol and render-intent model**; the
phone is merely the first, most reliable client.

1. `workers/presence` stays device-agnostic (people, cells, privacy,
   proximity). No device branches, ever.
2. `packages/shared` owns the neutral wire protocol plus a pure
   render-intent layer: `NearbyPresence`-style bucketed facts →
   `text_line | speech | arrow | ambient_summary` intents, localized.
3. Clients declare capabilities (`DeviceProfile` in `hello`) and render
   the intents they can. Thin adapters only.
4. The phone web app (`apps/web` `/hub`) is the v1 product: plain DOM
   Svelte, foreground/screen-on presence with Wake Lock, audio cues as a
   first-class output.
5. `apps/xr` is FROZEN as the Meta VR Start competition artifact (the
   competition's hands-usable requirement is the external requirement the
   freeze carve-out allows). It may later become the Android XR / Snap
   Specs spatial adapter.
6. Deviation from the original plan's directory tree: the browser runtime
   lives in `packages/presence-client` instead of `apps/web/src/lib`, so
   the phone hub and the glasses HUD share one implementation rather than
   two copies.

## Consequences

- Verified platform facts driving this: Meta Ray-Ban Display web apps
  support fetch/WebSocket, phone-sourced geolocation, orientation, and
  audio (developers.meta.com); Even Hub is live with a TypeScript SDK;
  mobile browsers freeze backgrounded pages, so v1 is explicitly a
  foreground client and pocket-walking waits for a native shell (Phase 3).
- Audio-only clients are supported by design (`speech` intents), not as a
  fallback.
- Ship order: phone hub → Meta HUD adapter → native shell (if needed for
  background presence) → Even G2 → Android XR/Snap.
