/**
 * Presence sensitivity configuration.
 *
 * One module of defaults; per-environment overrides arrive as Worker vars and
 * are coerced with `configFromEnvVars`, then validated by `resolveConfig`.
 * Device-agnostic by contract: nothing here may assume a particular headset.
 *
 * @typedef {'everyone' | 'quiet_only' | 'aggregate'} QuietVisibility
 */

/**
 * @typedef {object} PresenceConfig
 * @property {number} GEOHASH_PRECISION Geohash precision for live cells (6 ≈ 1.2 km × 0.6 km).
 * @property {number} PROXIMITY_RADIUS_M Pairwise proximity radius in meters.
 * @property {number} DISTANCE_BUCKET_M Distance quantization bucket size in meters.
 * @property {number} BEARING_BUCKET_DEG Bearing quantization bucket size in degrees; must divide 360.
 * @property {number} POSITION_TTL_S Server-side TTL for a member's last position, in seconds.
 * @property {number} UPDATE_MOVING_S Client update cadence while moving, in seconds.
 * @property {number} UPDATE_IDLE_S Client update cadence while idle, in seconds.
 * @property {number} HANDLE_ROTATION_S Opaque handle rotation period, in seconds.
 * @property {number} MAX_SPEED_MPS Plausibility ceiling for client-reported movement, m/s.
 * @property {number} MIN_ACCURACY_M Accuracy worse than this degrades the client to aggregate-only (never reject).
 * @property {QuietVisibility} QUIET_VISIBILITY Who may see QUIET members' individual markers.
 * @property {number} K_ANON D1 k-anonymity threshold; applied after rollup, at flush time only.
 * @property {number} GEO_SANITY_MAX_KM Anti-spoof radius check in km; 0 disables (default).
 * @property {number} D1_BUCKET_S D1 aggregation bucket, in seconds (15 minutes).
 * @property {number} D1_GEOHASH_LEN Geohash length used for D1 rows (parent rollup of the live cells).
 * @property {number} STALENESS_WINDOW_S ± freshness window for frame timestamps, seconds (clock offset applied).
 * @property {number} MAX_FRAME_BYTES Maximum accepted frame size in bytes.
 * @property {number} EDGE_MARGIN_M Dual-subscribe when within this distance of an adjacent cell edge.
 * @property {number} EDGE_HYSTERESIS_M Unsubscribe hysteresis beyond EDGE_MARGIN_M, in meters.
 * @property {number} MAX_SOCKETS_PER_CLIENT Maximum concurrent cell sockets per client (home + edges, corner case).
 * @property {number} MAX_MARKERS Maximum markers in one markers frame.
 */

/** @type {PresenceConfig} */
export const defaultConfig = {
	GEOHASH_PRECISION: 6,
	PROXIMITY_RADIUS_M: 60,
	DISTANCE_BUCKET_M: 10,
	BEARING_BUCKET_DEG: 45,
	POSITION_TTL_S: 30,
	UPDATE_MOVING_S: 2,
	UPDATE_IDLE_S: 10,
	HANDLE_ROTATION_S: 300,
	MAX_SPEED_MPS: 12,
	MIN_ACCURACY_M: 30,
	QUIET_VISIBILITY: 'everyone',
	K_ANON: 5,
	GEO_SANITY_MAX_KM: 0,
	D1_BUCKET_S: 900,
	D1_GEOHASH_LEN: 4,
	STALENESS_WINDOW_S: 30,
	MAX_FRAME_BYTES: 2048,
	EDGE_MARGIN_M: 120,
	EDGE_HYSTERESIS_M: 40,
	MAX_SOCKETS_PER_CLIENT: 4,
	MAX_MARKERS: 32,
};

/** @type {readonly QuietVisibility[]} */
const QUIET_VISIBILITIES = ['everyone', 'quiet_only', 'aggregate'];

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} key
 * @returns {number}
 */
function intIn(value, min, max, key) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new Error(`config ${key}: expected integer in [${min}, ${max}]`);
	}
	return value;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} key
 * @returns {number}
 */
function numIn(value, min, max, key) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value >= max) {
		throw new Error(`config ${key}: expected finite number in [${min}, ${max})`);
	}
	return value;
}

/**
 * Merge overrides over defaults and validate ranges/relationships. Throws on invalid input.
 * @param {Partial<PresenceConfig>} [overrides]
 * @returns {PresenceConfig}
 */
export function resolveConfig(overrides = {}) {
	/** @type {PresenceConfig} */
	const cfg = { ...defaultConfig, ...overrides };

	intIn(cfg.GEOHASH_PRECISION, 1, 12, 'GEOHASH_PRECISION');
	numIn(cfg.PROXIMITY_RADIUS_M, 1, 100_000, 'PROXIMITY_RADIUS_M');
	numIn(cfg.DISTANCE_BUCKET_M, 1, 1_000, 'DISTANCE_BUCKET_M');
	intIn(cfg.BEARING_BUCKET_DEG, 1, 360, 'BEARING_BUCKET_DEG');
	if (360 % cfg.BEARING_BUCKET_DEG !== 0) {
		throw new Error('config BEARING_BUCKET_DEG: must divide 360 evenly');
	}
	intIn(cfg.POSITION_TTL_S, 5, 3_600, 'POSITION_TTL_S');
	intIn(cfg.UPDATE_MOVING_S, 1, 300, 'UPDATE_MOVING_S');
	intIn(cfg.UPDATE_IDLE_S, cfg.UPDATE_MOVING_S, 3_600, 'UPDATE_IDLE_S (>= UPDATE_MOVING_S)');
	intIn(cfg.HANDLE_ROTATION_S, 30, 86_400, 'HANDLE_ROTATION_S');
	numIn(cfg.MAX_SPEED_MPS, 1, 200, 'MAX_SPEED_MPS');
	numIn(cfg.MIN_ACCURACY_M, 1, 100_000, 'MIN_ACCURACY_M');
	if (!QUIET_VISIBILITIES.includes(/** @type {QuietVisibility} */ (cfg.QUIET_VISIBILITY))) {
		throw new Error(`config QUIET_VISIBILITY: expected one of ${QUIET_VISIBILITIES.join(' | ')}`);
	}
	intIn(cfg.K_ANON, 1, 1_000, 'K_ANON');
	numIn(cfg.GEO_SANITY_MAX_KM, 0, 20_000, 'GEO_SANITY_MAX_KM');
	intIn(cfg.D1_BUCKET_S, 60, 86_400, 'D1_BUCKET_S');
	intIn(cfg.D1_GEOHASH_LEN, 1, 12, 'D1_GEOHASH_LEN');
	if (cfg.D1_GEOHASH_LEN >= cfg.GEOHASH_PRECISION) {
		throw new Error('config D1_GEOHASH_LEN: must be shorter than GEOHASH_PRECISION (rollup coarsens)');
	}
	intIn(cfg.STALENESS_WINDOW_S, 1, 600, 'STALENESS_WINDOW_S');
	intIn(cfg.MAX_FRAME_BYTES, 256, 65_536, 'MAX_FRAME_BYTES');
	numIn(cfg.EDGE_MARGIN_M, cfg.PROXIMITY_RADIUS_M, 100_000, 'EDGE_MARGIN_M (>= PROXIMITY_RADIUS_M)');
	numIn(cfg.EDGE_HYSTERESIS_M, 0, 10_000, 'EDGE_HYSTERESIS_M');
	intIn(cfg.MAX_SOCKETS_PER_CLIENT, 1, 9, 'MAX_SOCKETS_PER_CLIENT');
	intIn(cfg.MAX_MARKERS, 1, 256, 'MAX_MARKERS');
	return cfg;
}

/**
 * @param {PresenceConfig} cfg
 * @returns {boolean}
 */
export function isGeoSanityEnabled(cfg) {
	return cfg.GEO_SANITY_MAX_KM > 0;
}

/** @type {(keyof PresenceConfig)[]} */
const ENV_NUMBER_KEYS = [
	'GEOHASH_PRECISION',
	'PROXIMITY_RADIUS_M',
	'DISTANCE_BUCKET_M',
	'BEARING_BUCKET_DEG',
	'POSITION_TTL_S',
	'UPDATE_MOVING_S',
	'UPDATE_IDLE_S',
	'HANDLE_ROTATION_S',
	'MAX_SPEED_MPS',
	'MIN_ACCURACY_M',
	'K_ANON',
	'GEO_SANITY_MAX_KM',
	'D1_BUCKET_S',
	'D1_GEOHASH_LEN',
	'STALENESS_WINDOW_S',
	'MAX_FRAME_BYTES',
	'EDGE_MARGIN_M',
	'EDGE_HYSTERESIS_M',
	'MAX_SOCKETS_PER_CLIENT',
	'MAX_MARKERS',
];

/**
 * Coerce wrangler env vars (usually strings) into config overrides.
 * Unknown or non-numeric values are skipped, not fatal — `resolveConfig`
 * remains the single validation point.
 * @param {Record<string, unknown> | undefined} vars
 * @returns {Partial<PresenceConfig>}
 */
export function configFromEnvVars(vars) {
	if (!vars) return {};
	/** @type {Partial<PresenceConfig>} */
	const out = {};
	for (const key of ENV_NUMBER_KEYS) {
		const raw = vars[key];
		if (raw === undefined) continue;
		const n = typeof raw === 'number' ? raw : Number(raw);
		if (Number.isFinite(n)) /** @type {Record<string, unknown>} */ (out)[key] = n;
	}
	const qv = vars['QUIET_VISIBILITY'];
	if (typeof qv === 'string' && QUIET_VISIBILITIES.includes(/** @type {QuietVisibility} */ (qv))) {
		out.QUIET_VISIBILITY = /** @type {QuietVisibility} */ (qv);
	}
	return out;
}
