import { PROTOCOL_VERSION, decodeGeohash, haversineM, isGeoSanityEnabled, isValidGeohash } from '@urbaninversion/shared';
import { presenceConfig } from './env.js';

// Durable Object classes must be exported from the main module for the
// runtime (and wrangler deploy) to register them.
export { PresenceCell } from './do/presence-cell.js';
export { MetricsRollup } from './do/metrics-rollup.js';

/**
 * Presence Worker: the /api/* and /ws surface.
 *
 * Worker responsibilities: Origin validation, optional request.cf geo
 * sanity, cell routing to the PresenceCell Durable Object (idFromName), and
 * the public config endpoint. Everything stateful lives in the DOs.
 *
 * Privacy invariants: no positions, identifiers, or IPs are logged; the
 * client IP reaches the DO only as a scrubbed, server-set header used for
 * Turnstile remoteip and a hashed in-memory rate bucket.
 */

/**
 * @param {unknown} data
 * @param {number} [status]
 * @param {Record<string, string>} [extra]
 * @returns {Response}
 */
const json = (data, status = 200, extra = {}) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
	});

/**
 * Same-origin in production; the allowlisted dev origin (XR dev server)
 * gets a reflecting ACAO so /api/config works during `vite dev`.
 * @param {string | null} origin
 * @param {readonly string[]} allow
 * @returns {Record<string, string>}
 */
function corsHeaders(origin, allow) {
	if (origin && allow.includes(origin)) return { 'access-control-allow-origin': origin, vary: 'Origin' };
	return {};
}

/**
 * @param {import('@urbaninversion/shared').PresenceConfig} cfg
 * @param {import('./env.js').Env} env
 * @returns {Record<string, unknown>}
 */
function publicConfig(cfg, env) {
	return {
		v: PROTOCOL_VERSION,
		geohashPrecision: cfg.GEOHASH_PRECISION,
		proximityRadiusM: cfg.PROXIMITY_RADIUS_M,
		distanceBucketM: cfg.DISTANCE_BUCKET_M,
		bearingBucketDeg: cfg.BEARING_BUCKET_DEG,
		positionTtlS: cfg.POSITION_TTL_S,
		updateMovingS: cfg.UPDATE_MOVING_S,
		updateIdleS: cfg.UPDATE_IDLE_S,
		handleRotationS: cfg.HANDLE_ROTATION_S,
		minAccuracyM: cfg.MIN_ACCURACY_M,
		quietVisibility: cfg.QUIET_VISIBILITY,
		edgeMarginM: cfg.EDGE_MARGIN_M,
		edgeHysteresisM: cfg.EDGE_HYSTERESIS_M,
		maxSocketsPerClient: cfg.MAX_SOCKETS_PER_CLIENT,
		turnstileSitekey: env.TURNSTILE_SITEKEY ?? '',
	};
}

export default /** @type {ExportedHandler<import('./env.js').Env>} */ ({
	async fetch(request, env) {
		const url = new URL(request.url);
		const cfg = presenceConfig(env);
		const allow = env.ORIGIN_ALLOWLIST ?? [];
		const origin = request.headers.get('origin');
		const cors = corsHeaders(origin, allow);

		if (url.pathname === '/api/health') {
			return json({ ok: true, v: PROTOCOL_VERSION, ts: Date.now() }, 200, cors);
		}
		if (url.pathname === '/api/config' && request.method === 'GET') {
			return json(publicConfig(cfg, env), 200, {
				...cors,
				'cache-control': 'public, max-age=60',
			});
		}
		if (url.pathname === '/ws') {
			if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
			return upgradeWebSocket(request, env, cfg, url);
		}
		if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404, cors);
		return json({ error: 'not_found' }, 404);
	},
});

/**
 * @param {Request} request
 * @param {import('./env.js').Env} env
 * @param {import('@urbaninversion/shared').PresenceConfig} cfg
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function upgradeWebSocket(request, env, cfg, url) {
	const allow = env.ORIGIN_ALLOWLIST ?? [];
	const origin = request.headers.get('origin');
	// Strict: browsers always send Origin on WebSocket upgrades; anything
	// else (or a non-allowlisted value) is refused before any DO is touched.
	if (!origin || !allow.includes(origin)) {
		return json({ error: 'origin_forbidden' }, 403);
	}

	const cell = url.searchParams.get('cell') ?? '';
	if (!isValidGeohash(cell, cfg.GEOHASH_PRECISION)) {
		return json({ error: 'bad_cell' }, 400);
	}

	// Optional anti-spoof sanity check (default off — Phase 1 correction 5).
	// Coarse IP-geolocation vs claimed cell center; catches gross country-
	// scale spoofing only. Residual risk accepted and documented.
	if (isGeoSanityEnabled(cfg)) {
		const cfLat = request.cf?.latitude;
		const cfLon = request.cf?.longitude;
		if (typeof cfLat === 'string' && typeof cfLon === 'string') {
			const center = decodeGeohash(cell);
			const km = haversineM({ lat: Number(cfLat), lon: Number(cfLon) }, center) / 1000;
			if (km > cfg.GEO_SANITY_MAX_KM) return json({ error: 'geo_sanity' }, 403);
		}
	}

	const id = env.PRESENCE_CELL.idFromName(cell);
	const stub = env.PRESENCE_CELL.get(id);

	// Rebuild the request against a stable path, scrub any client-provided
	// X-UI-* headers, then set the trusted client IP for Turnstile remoteip.
	const doRequest = new Request(new URL(`/ws?cell=${encodeURIComponent(cell)}`, url), request);
	doRequest.headers.delete('x-ui-client-ip');
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	if (ip) doRequest.headers.set('x-ui-client-ip', ip);

	return stub.fetch(doRequest);
}
