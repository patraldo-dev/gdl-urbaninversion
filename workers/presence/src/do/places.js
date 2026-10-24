/**
 * PlacesDO: the registry of named dwell-space rooms (cafés, gyms).
 * Storage-backed (places are permanent), one global instance.
 *
 * Endpoints (via the worker's /api/places):
 *   POST /create {name, lat?, lon?} → {slug, display}  (idempotent per slug)
 *   GET  /nearby?lat=&lon=           → closest places (needs stored coords)
 *   GET  /search?q=                  → prefix/substring match on slug+display
 *
 * Anti-spam: per-IP create cap (in-memory, 10/day); global cap 5,000
 * places (oldest-coordinates-last evictions never happen — creation
 * simply 503s; raise the cap in config if ever needed).
 */

import { slugifyPlaceName, isValidPlaceSlug } from '@urbaninversion/shared';

const MAX_PLACES = 5_000;
const PER_IP_CREATES = 10;
const PER_IP_WINDOW_MS = 24 * 60 * 60_000;
const KEY_PREFIX = 'place:';

// overpass-api.de sits behind Cloudflare and 521s Cloudflare-Workers
// egress; kumi.systems is the primary, the main instance the fallback.
const OVERPASS_ENDPOINTS = [
	'https://overpass.kumi.systems/api/interpreter',
	'https://overpass-api.de/api/interpreter',
];
const EXTERN_TTL_MS = 6 * 60 * 60_000;
const EXTERN_CACHE_MAX = 500;

export class PlacesDO {
	/** @param {DurableObjectState} state @param {unknown} env */
	constructor(state, env) {
		this.state = state;
		this.env = env;
		/** @type {Map<string, number[]>} ip → creation timestamps */
		this.ipCreates = new Map();
	}

	/**
	 * @param {number} now
	 * @param {string} ip
	 * @returns {boolean}
	 */
	ipAllowed(now, ip) {
		if (!ip) return true;
		const ts = (this.ipCreates.get(ip) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS);
		this.ipCreates.set(ip, ts);
		return ts.length < PER_IP_CREATES;
	}

	/** @param {Request} request */
	async fetch(request) {
		const url = new URL(request.url);
		const now = Date.now();
		const json = (data, status = 200) =>
			new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

		if (url.pathname === '/create' && request.method === 'POST') {
			const ip = request.headers.get('x-ui-client-ip') ?? '';
			if (!this.ipAllowed(now, ip)) return json({ error: 'rate_limited' }, 429);
			/** @type {Record<string, unknown>} */
			let body;
			try {
				body = await request.json();
			} catch {
				return json({ error: 'bad_request' }, 400);
			}
			const display = typeof body['name'] === 'string' ? body['name'].trim().slice(0, 60) : '';
			if (display.length < 3) return json({ error: 'bad_name' }, 400);
			const lat = typeof body['lat'] === 'number' ? body['lat'] : undefined;
			const lon = typeof body['lon'] === 'number' ? body['lon'] : undefined;

			const base = slugifyPlaceName(display);
			if (!isValidPlaceSlug(base)) return json({ error: 'bad_name' }, 400);

			// Idempotent: exact slug exists → return it (with coords upgrade if
			// this creator offered some and the record lacks them).
			for (let n = 0; n < 50; n++) {
				const slug = n === 0 ? base : `${base}-${n + 1}`;
				if (slug.length > 40) break;
				const existing = await this.state.storage.get(KEY_PREFIX + slug);
				if (existing === undefined) {
					const count = await this.state.storage.list({ prefix: KEY_PREFIX }).then((l) => l.size);
					if (count >= MAX_PLACES) return json({ error: 'full' }, 503);
					/** @type {{ display: string, lat?: number, lon?: number, created: number }} */
					const rec = { display, lat, lon, created: now };
					if (lat === undefined) delete rec.lat;
					if (lon === undefined) delete rec.lon;
					await this.state.storage.put(KEY_PREFIX + slug, rec);
					return json({ slug, display });
				}
				const rec = /** @type {{ display: string, lat?: number, lon?: number }} */ (existing);
				const sameName = rec.display.toLowerCase() === display.toLowerCase();
				const near =
					lat === undefined ||
					rec.lat === undefined ||
					rec.lon === undefined ||
					Math.hypot((rec.lat - lat) * 111_320, (rec.lon - lon) * 78_000) < 150;
				if (sameName && near) {
					if (lat !== undefined && rec.lat === undefined) {
						await this.state.storage.put(KEY_PREFIX + slug, { ...rec, lat, lon, created: now });
					}
					return json({ slug, display: rec.display });
				}
				// Different place, colliding slug → try slug-2, slug-3…
			}
			return json({ error: 'collision' }, 409);
		}

		if (url.pathname === '/nearby' && request.method === 'GET') {
			const lat = Number(url.searchParams.get('lat'));
			const lon = Number(url.searchParams.get('lon'));
			if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: 'bad_request' }, 400);
			const all = await this.state.storage.list({ prefix: KEY_PREFIX });
			/** @type {{ slug: string, display: string, meters: number }[]} */
			const scored = [];
			for (const [key, raw] of all) {
				const rec = /** @type {{ display: string, lat?: number, lon?: number }} */ (raw);
				if (rec.lat === undefined || rec.lon === undefined) continue;
				const meters = Math.hypot((rec.lat - lat) * 111_320, (rec.lon - lon) * 78_000);
				if (meters > 800) continue;
				scored.push({ slug: key.slice(KEY_PREFIX.length), display: rec.display, meters: Math.round(meters) });
			}
			scored.sort((a, b) => a.meters - b.meters);
			return json({ places: scored.slice(0, 10) });
		}

		if (url.pathname === '/search' && request.method === 'GET') {
			const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
			if (q.length < 2) return json({ places: [] });
			const all = await this.state.storage.list({ prefix: KEY_PREFIX });
			/** @type {{ slug: string, display: string }[]} */
			const hits = [];
			for (const [key, raw] of all) {
				const rec = /** @type {{ display: string }} */ (raw);
				const slug = key.slice(KEY_PREFIX.length);
				if (slug.includes(q) || rec.display.toLowerCase().includes(q)) {
					hits.push({ slug, display: rec.display });
				}
				if (hits.length >= 10) break;
			}
			return json({ places: hits });
		}

		return json({ error: 'not_found' }, 404);
	}
}
