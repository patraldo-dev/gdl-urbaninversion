/**
 * Module-level presence store: the single source of truth the ECS systems
 * read each frame (markers, aggregates, self state, alignment, camera
 * pose). Written by the presence service; read by SpatialDiscoverySystem
 * and PresenceUiSystem. Solitude/INVISIBLE = empty markers + state flag;
 * coarse = markers empty by definition (aggregates shown instead).
 */

/**
 * @typedef {object} PresenceStatus
 * @property {import('@urbaninversion/shared').PresenceState} state
 * @property {boolean} coarse Aggregate-only (OBSERVER or accuracy worse than MIN_ACCURACY_M).
 * @property {boolean} connected
 * @property {number} alignmentDeg
 * @property {import('./device/providers/heading-provider.js').HeadingAlignmentState} alignmentState
 * @property {string} alignmentHint
 * @property {string} locationError
 * @property {number} [accuracyM]
 * @property {number} [distanceBucketM] Server bucket geometry from hello-ack.
 * @property {number} [bearingBucketDeg] Server bucket geometry from hello-ack.
 */

const status = {
	state: /** @type {import('@urbaninversion/shared').PresenceState} */ ('observer'),
	coarse: false,
	connected: false,
	alignmentDeg: 0,
	alignmentState: /** @type {'no-data' | 'calibrating' | 'locked'} */ ('no-data'),
	alignmentHint: '',
	locationError: '',
};

/** @type {import('@urbaninversion/shared').MarkerEntry[]} */
let markers = [];
/** @type {{ open: number, quiet: number } | null} */
let aggregate = null;
/** @type {{ x: number, y: number, z: number } | null} */
let cameraPose = null;

export const presenceStore = {
	/** @param {import('@urbaninversion/shared').MarkerEntry[]} list */
	setMarkers(list) {
		markers = list;
	},
	getMarkers() {
		return markers;
	},
	/** @param {{ open: number, quiet: number } | null} counts */
	setAggregate(counts) {
		aggregate = counts;
	},
	getAggregate() {
		return aggregate;
	},
	/** @param {Partial<PresenceStatus>} patch */
	patchStatus(patch) {
		Object.assign(status, patch);
	},
	getStatus() {
		return status;
	},
	/** @param {{ x: number, y: number, z: number } | null} pose Latest tracked head pose (world). */
	setCameraPose(pose) {
		cameraPose = pose;
	},
	getCameraPose() {
		return cameraPose;
	},
};
