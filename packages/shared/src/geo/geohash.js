import { clampLat, haversineM, wrapLon } from './math.js';

/**
 * Geohash encode/decode/neighbors. Cells at one precision are equal-size
 * degree rectangles, so neighbor centers sit exactly one cell-width away —
 * which is what the dual-subscription margin logic relies on.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * @param {string} gh
 * @param {number} [length]
 * @returns {boolean}
 */
export function isValidGeohash(gh, length) {
	if (gh.length === 0 || (length !== undefined && gh.length !== length)) return false;
	for (const ch of gh) {
		if (BASE32.indexOf(ch) < 0) return false;
	}
	return true;
}

/**
 * @typedef {object} GeohashBBox
 * @property {number} minLat
 * @property {number} maxLat
 * @property {number} minLon
 * @property {number} maxLon
 */

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} precision
 * @returns {string}
 */
export function encodeGeohash(lat, lon, precision) {
	if (!Number.isInteger(precision) || precision < 1 || precision > 12) {
		throw new Error('encodeGeohash: precision must be an integer 1..12');
	}
	const p = clampLat(lat);
	const l = Math.min(180, Math.max(-180, lon));
	let latMin = -90;
	let latMax = 90;
	let lonMin = -180;
	let lonMax = 180;
	let isLon = true;
	let bit = 0;
	let ch = 0;
	let out = '';
	while (out.length < precision) {
		if (isLon) {
			const mid = (lonMin + lonMax) / 2;
			if (l >= mid) {
				ch |= 1 << (4 - bit);
				lonMin = mid;
			} else {
				lonMax = mid;
			}
		} else {
			const mid = (latMin + latMax) / 2;
			if (p >= mid) {
				ch |= 1 << (4 - bit);
				latMin = mid;
			} else {
				latMax = mid;
			}
		}
		isLon = !isLon;
		bit++;
		if (bit === 5) {
			out += BASE32.charAt(ch);
			bit = 0;
			ch = 0;
		}
	}
	return out;
}

/**
 * @param {string} gh
 * @returns {GeohashBBox}
 */
export function geohashBBox(gh) {
	if (!isValidGeohash(gh)) throw new Error(`geohashBBox: invalid geohash "${gh}"`);
	let latMin = -90;
	let latMax = 90;
	let lonMin = -180;
	let lonMax = 180;
	let isLon = true;
	for (const ch of gh) {
		const idx = BASE32.indexOf(ch);
		for (let bit = 4; bit >= 0; bit--) {
			const b = (idx >> bit) & 1;
			if (isLon) {
				const mid = (lonMin + lonMax) / 2;
				if (b === 1) lonMin = mid;
				else lonMax = mid;
			} else {
				const mid = (latMin + latMax) / 2;
				if (b === 1) latMin = mid;
				else latMax = mid;
			}
			isLon = !isLon;
		}
	}
	return { minLat: latMin, maxLat: latMax, minLon: lonMin, maxLon: lonMax };
}

/**
 * Center of the cell.
 * @param {string} gh
 * @returns {import('./math.js').LatLon}
 */
export function decodeGeohash(gh) {
	const b = geohashBBox(gh);
	return { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
}

/**
 * @typedef {object} GeohashNeighbors
 * @property {string} n
 * @property {string} s
 * @property {string} e
 * @property {string} w
 * @property {string} ne
 * @property {string} nw
 * @property {string} se
 * @property {string} sw
 */

/**
 * The 8 adjacent cells, computed by encoding the adjacent cells' centers.
 * Longitude wraps at the antimeridian; latitude clamps at the poles, where
 * some "neighbors" degenerate to the cell itself — acceptable for
 * dual-subscription margin logic.
 * @param {string} gh
 * @returns {GeohashNeighbors}
 */
export function geohashNeighbors(gh) {
	const b = geohashBBox(gh);
	const centerLat = (b.minLat + b.maxLat) / 2;
	const centerLon = (b.minLon + b.maxLon) / 2;
	const dLat = b.maxLat - b.minLat;
	const dLon = b.maxLon - b.minLon;
	/** @param {number} latSteps @param {number} lonSteps @returns {string} */
	const at = (latSteps, lonSteps) =>
		encodeGeohash(clampLat(centerLat + latSteps * dLat), wrapLon(centerLon + lonSteps * dLon), gh.length);
	return {
		n: at(1, 0),
		s: at(-1, 0),
		e: at(0, 1),
		w: at(0, -1),
		ne: at(1, 1),
		nw: at(1, -1),
		se: at(-1, 1),
		sw: at(-1, -1),
	};
}

/**
 * Distance in meters from a point to the nearest edge of cell `gh`. The
 * client uses this to decide when to dual-subscribe (EDGE_MARGIN_M) and when
 * to unsubscribe (EDGE_MARGIN_M + EDGE_HYSTERESIS_M).
 * @param {import('./math.js').LatLon} p
 * @param {string} gh
 * @returns {number}
 */
export function distanceToCellEdgeM(p, gh) {
	const b = geohashBBox(gh);
	const lat = Math.min(b.maxLat, Math.max(b.minLat, p.lat));
	const lon = Math.min(b.maxLon, Math.max(b.minLon, p.lon));
	/** @type {import('./math.js').LatLon[]} */
	const candidates = [
		{ lat, lon: b.minLon },
		{ lat, lon: b.maxLon },
		{ lat: b.minLat, lon },
		{ lat: b.maxLat, lon },
	];
	let min = Infinity;
	for (const c of candidates) min = Math.min(min, haversineM(p, c));
	return min;
}
