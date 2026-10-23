/**
 * Presence store with subscribe support (Svelte-friendly): the phone hub
 * and HUD adapters render from this. Written by the presence service.
 * Solitude/INVISIBLE = empty markers + state flag; coarse = markers empty
 * by definition (aggregates shown instead).
 */

/**
 * @typedef {object} PresenceStatus
 * @property {import('@urbaninversion/shared').PresenceState} state
 * @property {boolean} coarse Aggregate-only (OBSERVER or accuracy worse than MIN_ACCURACY_M).
 * @property {boolean} connected
 * @property {number | null} headingDeg Current absolute heading (compass or GPS course), null when unknown.
 * @property {'no-data' | 'permission' | 'reading' | 'gps-course'} headingSource
 * @property {string} locationError
 * @property {string | null} placeSlug Joined place room (null = street cells).
 * @property {number} [accuracyM]
 * @property {number} [distanceBucketM] Server bucket geometry from hello-ack.
 * @property {number} [bearingBucketDeg] Server bucket geometry from hello-ack.
 */

const status = {
	state: /** @type {import('@urbaninversion/shared').PresenceState} */ ('observer'),
	coarse: false,
	connected: false,
	headingDeg: null,
	headingSource: /** @type {'no-data' | 'permission' | 'reading' | 'gps-course'} */ ('no-data'),
	locationError: '',
	placeSlug: null,
};

/** @type {import('@urbaninversion/shared').MarkerEntry[]} */
let markers = [];
/** @type {{ open: number, quiet: number } | null} */
let aggregate = null;
/** @type {Set<() => void>} */
const listeners = new Set();

function emit() {
	for (const fn of listeners) fn();
}

export const presenceStore = {
	/**
	 * Subscribe to any store change.
	 * @param {() => void} fn
	 * @returns {() => void} unsubscribe
	 */
	subscribe(fn) {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
	/** @param {import('@urbaninversion/shared').MarkerEntry[]} list */
	setMarkers(list) {
		markers = list;
		emit();
	},
	getMarkers() {
		return markers;
	},
	/** @param {{ open: number, quiet: number } | null} counts */
	setAggregate(counts) {
		aggregate = counts;
		emit();
	},
	getAggregate() {
		return aggregate;
	},
	/** @param {Partial<PresenceStatus>} patch */
	patchStatus(patch) {
		Object.assign(status, patch);
		emit();
	},
	getStatus() {
		return status;
	},
};
