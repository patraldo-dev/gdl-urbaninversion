/**
 * OpenStreetMap venue discovery for place rooms: pure helpers to build an
 * Overpass query around a position and normalize the response into
 * venue entries. The worker proxies/caches the network call
 * (PlacesDO /extern); these functions live in shared so they're unit
 * tested.
 *
 * Dwell-space amenity set: cafés, restaurants, fast food, bars, pubs,
 * food courts, libraries, plus fitness/sports centres (OSM models gyms
 * as leisure=fitness_centre, sometimes amenity=fitness_centre).
 */

/** @typedef {object} OsmVenue
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 * @property {string} kind amenity/leisure value (label hint)
 */

const AMENITIES = '^(cafe|restaurant|fast_food|bar|pub|food_court|library|fitness_centre)$';
const LEISURES = '^(fitness_centre|sports_centre)$';

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusM]
 * @returns {string} Overpass QL statement for the POST body.
 */
export function buildOverpassQuery(lat, lon, radiusM = 200) {
	const center = `${radiusM},${lat.toFixed(6)},${lon.toFixed(6)}`;
	return (
		`[out:json][timeout:8];(` +
		`node(around:${center})[name][amenity~"${AMENITIES}"];` +
		`way(around:${center})[name][amenity~"${AMENITIES}"];` +
		`node(around:${center})[name][leisure~"${LEISURES}"];` +
		`way(around:${center})[name][leisure~"${LEISURES}"];` +
		`);out center tags 30;`
	);
}

/**
 * @param {unknown} json Overpass response
 * @param {number} lat observer position
 * @param {number} lon
 * @param {number} [limit]
 * @returns {OsmVenue[]} nearest named venues, distance-sorted
 */
export function normalizeOverpassVenues(json, lat, lon, limit = 15) {
	if (typeof json !== 'object' || json === null) return [];
	const elements = /** @type {{ elements?: unknown }} */ (json)['elements'];
	if (!Array.isArray(elements)) return [];
	/** @type {OsmVenue[]} */
	const out = [];
	const seen = new Set();
	for (const el of elements) {
		if (typeof el !== 'object' || el === null) continue;
		const e = /** @type {Record<string, unknown>} */ (el);
		const tags = /** @type {Record<string, unknown>} */ (e['tags']);
		if (typeof tags !== 'object' || tags === null) continue;
		const name = tags['name'];
		if (typeof name !== 'string' || name.length < 2) continue;
		/** @type {{ lat?: unknown, lon?: unknown }} */
		let coords = e;
		if (typeof e['center'] === 'object' && e['center'] !== null) {
			coords = /** @type {{ lat?: unknown, lon?: unknown }} */ (e['center']);
		}
		const vlat = Number(coords['lat']);
		const vlon = Number(coords['lon']);
		if (!Number.isFinite(vlat) || !Number.isFinite(vlon)) continue;
		const kind =
			typeof tags['amenity'] === 'string'
				? tags['amenity']
				: typeof tags['leisure'] === 'string'
					? tags['leisure']
					: 'venue';
		// Dedupe by name: same-name venues within the query radius land in
		// the same room after create-dedupe anyway (create merges same-name
		// places within 150 m), so one entry — the nearest representation —
		// is the honest list.
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ name: name.slice(0, 60), lat: vlat, lon: vlon, kind });
	}
	out.sort(
		(a, b) =>
			haversineM({ lat, lon }, a) - haversineM({ lat, lon }, b)
	);
	return out.slice(0, limit);
}

/**
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @returns {number} meters (equirectangular approximation — fine at
 * venue scale)
 */
function haversineM(a, b) {
	const dy = (b.lat - a.lat) * 111_320;
	const dx = (b.lon - a.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
	return Math.hypot(dx, dy);
}
