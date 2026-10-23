/**
 * Place rooms: named, deliberately-joined presence rooms for dwell
 * spaces (cafés, gyms) — vs geohash cells, which are automatic and
 * street-scale. A place cell rides the same subscribe-by-string room
 * mechanism (`hello.cell`), so a place is `place:cafe-aurora` where a
 * street room is `u33dc0`.
 *
 * Indoors, distance/bearing are meaningless (everyone is *here*), so
 * place markers carry dist/brng = 0 and clients render roster-style.
 */

import { isValidGeohash } from './geo/geohash.js';

export const PLACE_PREFIX = 'place:';

/** 3–40 chars: lowercase letters, digits, dashes; no leading/trailing dash. */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/;

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isValidPlaceSlug(slug) {
	return SLUG_RE.test(slug);
}

/**
 * @param {string} cell
 * @returns {boolean}
 */
export function isPlaceCell(cell) {
	return cell.startsWith(PLACE_PREFIX) && isValidPlaceSlug(cell.slice(PLACE_PREFIX.length));
}

/**
 * @param {string} cell
 * @returns {string} the slug without the prefix ('' when not a place cell)
 */
export function placeSlugFromCell(cell) {
	return isPlaceCell(cell) ? cell.slice(PLACE_PREFIX.length) : '';
}

/**
 * A valid room name: a geohash cell (street mode) or a place room.
 * @param {string} cell
 * @param {number} precision
 * @returns {boolean}
 */
export function isValidRoomName(cell, precision) {
	return isValidGeohash(cell, precision) || isPlaceCell(cell);
}

/**
 * Human display name → slug: strip accents, keep [a-z0-9-], squeeze
 * dashes. "Café Aurora" → "cafe-aurora".
 * @param {string} name
 * @returns {string}
 */
export function slugifyPlaceName(name) {
	const base = name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/g, '');
	return base;
}
