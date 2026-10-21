/** Pure geodesy helpers. Approximations are fine at neighborhood scale (< few km). */

/**
 * @typedef {object} LatLon
 * @property {number} lat
 * @property {number} lon
 */

export const EARTH_RADIUS_M = 6_371_008.8;

/** @param {number} deg @returns {number} */
const toRad = (deg) => (deg * Math.PI) / 180;
/** @param {number} rad @returns {number} */
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Great-circle distance in meters.
 * @param {LatLon} a
 * @param {LatLon} b
 * @returns {number}
 */
export function haversineM(a, b) {
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Initial bearing from `from` to `to`, degrees normalized to [0, 360).
 * @param {LatLon} from
 * @param {LatLon} to
 * @returns {number}
 */
export function bearingDeg(from, to) {
	const phi1 = toRad(from.lat);
	const phi2 = toRad(to.lat);
	const dLon = toRad(to.lon - from.lon);
	const y = Math.sin(dLon) * Math.cos(phi2);
	const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Destination point given start, bearing (degrees clockwise from north), distance (meters).
 * @param {LatLon} from
 * @param {number} bearing
 * @param {number} distM
 * @returns {LatLon}
 */
export function destination(from, bearing, distM) {
	const d = distM / EARTH_RADIUS_M;
	const theta = toRad(bearing);
	const phi1 = toRad(from.lat);
	const lam1 = toRad(from.lon);
	const sinPhi2 = Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(theta);
	const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
	const lam2 =
		lam1 + Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(phi1), Math.cos(d) - Math.sin(phi1) * sinPhi2);
	return { lat: toDeg(phi2), lon: ((toDeg(lam2) + 540) % 360) - 180 };
}

/** @param {number} lat @returns {number} */
export const clampLat = (lat) => Math.min(90, Math.max(-90, lat));
/** @param {number} lon @returns {number} */
export const wrapLon = (lon) => ((lon + 540) % 360) - 180;
