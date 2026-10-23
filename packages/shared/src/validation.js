import { isB64Url } from './crypto.js';
import { isValidDidKeyP256 } from './did.js';
import { normalizeDeviceProfile } from './device-profile.js';
import { isValidGeohash } from './geo/geohash.js';
import { isValidHandle } from './presence/handles.js';
import { PROTOCOL_VERSION } from './version.js';

/**
 * Schema validation for every wire frame. Returns either the typed frame or
 * an error code that maps 1:1 onto a wire ErrorFrame. Rejects oversized,
 * malformed, wrong-version, and out-of-range frames before any business
 * logic or signature work runs.
 */

/**
 * @template T
 * @typedef {{ ok: true, frame: T } | { ok: false, code: import('./types.js').ErrorCode, msg: string }} ParseResult
 */

/**
 * @template T
 * @param {import('./types.js').ErrorCode} code
 * @param {string} msg
 * @returns {ParseResult<T>}
 */
const err = (code, msg) => ({ ok: false, code, msg });

/** @param {unknown} x @returns {x is Record<string, unknown>} */
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
/** @param {unknown} x @returns {x is number} */
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
/** @param {unknown} x @returns {x is number} */
const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
/** @param {unknown} x @returns {x is string} */
const isStr = (x) => typeof x === 'string';

/** Unix-ms epoch, sane range (1970..2100). @param {unknown} x @returns {x is number} */
const isTs = (x) => isInt(x) && x > 0 && x < 4_102_444_800_000;
/** @param {unknown} x @returns {x is string} */
const isSig = (x) => isStr(x) && isB64Url(x) && x.length >= 64 && x.length <= 128;

/** @type {readonly import('./types.js').ErrorCode[]} */
const ERROR_CODES = [
	'bad_frame',
	'bad_version',
	'bad_state',
	'bad_cell',
	'bad_sig',
	'stale_ts',
	'oversized',
	'cfg_mismatch',
	'turnstile_failed',
	'rate_limited',
	'speed_violation',
	'cell_mismatch',
	'origin_forbidden',
	'geo_sanity',
	'server_error',
];

const PRESENCE_STATES = /** @type {readonly import('./types.js').PresenceState[]} */ ([
	'open',
	'quiet',
	'observer',
	'invisible',
]);

/** @param {unknown} x @returns {x is import('./types.js').PresenceState} */
const isPresenceState = (x) =>
	isStr(x) && PRESENCE_STATES.includes(/** @type {import('./types.js').PresenceState} */ (x));

/** @param {unknown} x @returns {x is import('./types.js').ErrorCode} */
const isErrorCode = (x) =>
	isStr(x) && ERROR_CODES.includes(/** @type {import('./types.js').ErrorCode} */ (x));

/**
 * @param {unknown} data
 * @param {import('./config.js').PresenceConfig} cfg
 * @returns {ParseResult<import('./types.js').ClientFrame>}
 */
export function parseClientFrame(data, cfg) {
	if (!isStr(data)) return err('bad_frame', 'frame must be a text string');
	if (data.length > cfg.MAX_FRAME_BYTES) return err('oversized', `frame exceeds ${cfg.MAX_FRAME_BYTES} bytes`);
	/** @type {unknown} */
	let raw;
	try {
		raw = JSON.parse(data);
	} catch {
		return err('bad_frame', 'invalid JSON');
	}
	if (!isObj(raw)) return err('bad_frame', 'frame must be a JSON object');
	if (raw['v'] !== PROTOCOL_VERSION) return err('bad_version', `expected v=${PROTOCOL_VERSION}`);
	switch (raw['op']) {
		case 'hello':
			return parseHello(raw, cfg);
		case 'pos':
			return parsePos(raw);
		case 'state':
			return parseState(raw);
		case 'home':
			return parseHome(raw, cfg);
		case 'block':
			return parseBlock(raw);
		default:
			return err('bad_frame', `unknown op ${String(raw['op'])}`);
	}
}

/**
 * @param {Record<string, unknown>} raw
 * @param {import('./config.js').PresenceConfig} cfg
 * @returns {ParseResult<import('./types.js').HelloFrame>}
 */
function parseHello(raw, cfg) {
	const did = raw['did'];
	if (!isStr(did) || !isValidDidKeyP256(did)) return err('bad_frame', 'hello.did: not a valid P-256 did:key');
	const state = raw['state'];
	if (!isPresenceState(state)) {
		return err('bad_state', 'hello.state: unknown presence state');
	}
	const cell = raw['cell'];
	if (!isStr(cell) || !isValidGeohash(cell, cfg.GEOHASH_PRECISION)) {
		return err('bad_cell', `hello.cell: expected ${cfg.GEOHASH_PRECISION}-char geohash`);
	}
	const role = raw['role'];
	if (role !== 'home' && role !== 'edge') return err('bad_frame', 'hello.role: expected home|edge');
	const turnstile = raw['turnstile'];
	const pair = raw['pair'];
	/** @type {string | undefined} */
	let pairTicket;
	if (pair !== undefined) {
		if (!isStr(pair) || !/^pt_[A-Za-z0-9_-]{26,64}$/.test(pair)) {
			return err('bad_frame', 'hello.pair: invalid pairing ticket');
		}
		pairTicket = pair;
	}
	if ((pairTicket !== undefined) === (isStr(turnstile) && turnstile.length >= 10)) {
		// XOR violated: both or neither.
		if (pairTicket !== undefined) return err('bad_frame', 'hello: pair and turnstile are mutually exclusive');
	}
	if (pairTicket === undefined && (!isStr(turnstile) || turnstile.length < 10 || turnstile.length > 4096)) {
		return err('bad_frame', 'hello.turnstile: invalid token');
	}
	const helloCfg = raw['cfg'];
	if (!isObj(helloCfg)) return err('bad_frame', 'hello.cfg: expected object');
	if (helloCfg['v'] !== PROTOCOL_VERSION) return err('bad_version', 'hello.cfg.v mismatch');
	const precision = helloCfg['geohashPrecision'];
	if (!isInt(precision) || precision < 1 || precision > 12) {
		return err('bad_frame', 'hello.cfg.geohashPrecision: invalid');
	}
	if (precision !== cfg.GEOHASH_PRECISION) {
		return err('cfg_mismatch', `client precision ${precision} != server ${cfg.GEOHASH_PRECISION}`);
	}
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'hello.ts: invalid timestamp');
	const sig = raw['sig'];
	if (!isSig(sig)) return err('bad_sig', 'hello.sig: invalid');
	/** @type {import('./types.js').HelloFrame} */
	const frame = {
		v: PROTOCOL_VERSION,
		op: 'hello',
		did,
		state,
		cell,
		role,
		...(pairTicket !== undefined
			? { pair: pairTicket }
			: { turnstile: /** @type {string} */ (turnstile) }),
		cfg: { v: PROTOCOL_VERSION, geohashPrecision: precision },
		ts,
		sig,
	};
	// Optional capability block; the server stays device-agnostic but
	// validates the shape so malformed declarations fail loudly at the door.
	const dev = raw['dev'];
	if (dev !== undefined) {
		const parsedDev = normalizeDeviceProfile(dev);
		if (!parsedDev.ok) return err('bad_frame', `hello.${parsedDev.error}`);
		frame.dev = parsedDev.profile;
	}
	return { ok: true, frame };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').PosFrame>}
 */
function parsePos(raw) {
	const lat = raw['lat'];
	if (!isNum(lat) || lat < -90 || lat > 90) return err('bad_frame', 'pos.lat out of range');
	const lon = raw['lon'];
	if (!isNum(lon) || lon < -180 || lon > 180) return err('bad_frame', 'pos.lon out of range');
	const accuracy = raw['accuracy'];
	if (!isNum(accuracy) || accuracy <= 0 || accuracy > 100_000) {
		return err('bad_frame', 'pos.accuracy out of range');
	}
	/** @type {number | undefined} */
	let heading;
	if (raw['heading'] !== undefined) {
		const h = raw['heading'];
		if (!isNum(h) || h < 0 || h >= 360) return err('bad_frame', 'pos.heading out of range');
		heading = h;
	}
	/** @type {number | undefined} */
	let speed;
	if (raw['speed'] !== undefined) {
		const s = raw['speed'];
		if (!isNum(s) || s < 0 || s > 1_000) return err('bad_frame', 'pos.speed out of range');
		speed = s;
	}
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'pos.ts: invalid timestamp');
	const sig = raw['sig'];
	if (!isSig(sig)) return err('bad_sig', 'pos.sig: invalid');
	/** @type {import('./types.js').PosFrame} */
	const frame = { v: PROTOCOL_VERSION, op: 'pos', lat, lon, accuracy, ts, sig };
	if (heading !== undefined) frame.heading = heading;
	if (speed !== undefined) frame.speed = speed;
	return { ok: true, frame };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').StateFrame>}
 */
function parseState(raw) {
	const state = raw['state'];
	if (!isPresenceState(state)) {
		return err('bad_state', 'state.state: unknown presence state');
	}
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'state.ts: invalid timestamp');
	const sig = raw['sig'];
	if (!isSig(sig)) return err('bad_sig', 'state.sig: invalid');
	return { ok: true, frame: { v: PROTOCOL_VERSION, op: 'state', state, ts, sig } };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {import('./config.js').PresenceConfig} cfg
 * @returns {ParseResult<import('./types.js').HomeFrame>}
 */
function parseHome(raw, cfg) {
	const cell = raw['cell'];
	if (!isStr(cell) || !isValidGeohash(cell, cfg.GEOHASH_PRECISION)) {
		return err('bad_cell', `home.cell: expected ${cfg.GEOHASH_PRECISION}-char geohash`);
	}
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'home.ts: invalid timestamp');
	const sig = raw['sig'];
	if (!isSig(sig)) return err('bad_sig', 'home.sig: invalid');
	return { ok: true, frame: { v: PROTOCOL_VERSION, op: 'home', cell, ts, sig } };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').BlockFrame>}
 */
function parseBlock(raw) {
	const handle = raw['handle'];
	if (!isStr(handle) || !isValidHandle(handle)) return err('bad_frame', 'block.handle: invalid');
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'block.ts: invalid timestamp');
	const sig = raw['sig'];
	if (!isSig(sig)) return err('bad_sig', 'block.sig: invalid');
	return { ok: true, frame: { v: PROTOCOL_VERSION, op: 'block', handle, ts, sig } };
}

/**
 * @param {unknown} data
 * @param {import('./config.js').PresenceConfig} cfg
 * @returns {ParseResult<import('./types.js').ServerFrame>}
 */
export function parseServerFrame(data, cfg) {
	if (!isStr(data)) return err('bad_frame', 'frame must be a text string');
	if (data.length > cfg.MAX_FRAME_BYTES * 8) return err('oversized', 'server frame too large');
	/** @type {unknown} */
	let raw;
	try {
		raw = JSON.parse(data);
	} catch {
		return err('bad_frame', 'invalid JSON');
	}
	if (!isObj(raw)) return err('bad_frame', 'frame must be a JSON object');
	if (raw['v'] !== PROTOCOL_VERSION) return err('bad_version', `expected v=${PROTOCOL_VERSION}`);
	switch (raw['op']) {
		case 'hello-ack':
			return parseHelloAck(raw);
		case 'markers':
			return parseMarkers(raw, cfg);
		case 'aggregate':
			return parseAggregate(raw);
		case 'error':
			return parseError(raw);
		default:
			return err('bad_frame', `unknown op ${String(raw['op'])}`);
	}
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').HelloAckFrame>}
 */
function parseHelloAck(raw) {
	const cell = raw['cell'];
	if (!isStr(cell) || !isValidGeohash(cell)) return err('bad_cell', 'hello-ack.cell: invalid');
	const role = raw['role'];
	if (role !== 'home' && role !== 'edge') return err('bad_frame', 'hello-ack.role: expected home|edge');
	const serverTs = raw['serverTs'];
	if (!isTs(serverTs)) return err('bad_frame', 'hello-ack.serverTs: invalid');
	const coarse = raw['coarse'];
	if (typeof coarse !== 'boolean') return err('bad_frame', 'hello-ack.coarse: expected boolean');
	const c = raw['cfg'];
	if (!isObj(c)) return err('bad_frame', 'hello-ack.cfg: expected object');
	const distanceBucketM = c['distanceBucketM'];
	if (!isNum(distanceBucketM) || distanceBucketM <= 0) return err('bad_frame', 'hello-ack.cfg.distanceBucketM');
	const bearingBucketDeg = c['bearingBucketDeg'];
	if (!isNum(bearingBucketDeg) || bearingBucketDeg <= 0 || !Number.isInteger(360 / bearingBucketDeg)) {
		return err('bad_frame', 'hello-ack.cfg.bearingBucketDeg');
	}
	const proximityRadiusM = c['proximityRadiusM'];
	if (!isNum(proximityRadiusM) || proximityRadiusM <= 0) return err('bad_frame', 'hello-ack.cfg.proximityRadiusM');
	const handleRotationS = c['handleRotationS'];
	if (!isInt(handleRotationS) || handleRotationS < 1) return err('bad_frame', 'hello-ack.cfg.handleRotationS');
	const minAccuracyM = c['minAccuracyM'];
	if (!isNum(minAccuracyM) || minAccuracyM <= 0) return err('bad_frame', 'hello-ack.cfg.minAccuracyM');
	const quietVisibility = c['quietVisibility'];
	if (quietVisibility !== 'everyone' && quietVisibility !== 'quiet_only' && quietVisibility !== 'aggregate') {
		return err('bad_frame', 'hello-ack.cfg.quietVisibility');
	}
	return {
		ok: true,
		frame: {
			v: PROTOCOL_VERSION,
			op: 'hello-ack',
			cell,
			role,
			serverTs,
			coarse,
			cfg: { distanceBucketM, bearingBucketDeg, proximityRadiusM, handleRotationS, minAccuracyM, quietVisibility },
		},
	};
}

/**
 * @param {Record<string, unknown>} raw
 * @param {import('./config.js').PresenceConfig} cfg
 * @returns {ParseResult<import('./types.js').MarkersFrame>}
 */
function parseMarkers(raw, cfg) {
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'markers.ts: invalid timestamp');
	const rawMarkers = raw['markers'];
	if (!Array.isArray(rawMarkers) || rawMarkers.length > cfg.MAX_MARKERS) {
		return err('bad_frame', `markers.markers: expected up to ${cfg.MAX_MARKERS} entries`);
	}
	/** @type {import('./types.js').MarkerEntry[]} */
	const markers = [];
	const maxBrng = Math.round(360 / cfg.BEARING_BUCKET_DEG) - 1;
	for (const m of rawMarkers) {
		if (!isObj(m)) return err('bad_frame', 'markers[]: expected objects');
		const handle = m['handle'];
		if (!isStr(handle) || !isValidHandle(handle)) return err('bad_frame', 'markers[].handle: invalid');
		const state = m['state'];
		if (state !== 'open' && state !== 'quiet') return err('bad_frame', 'markers[].state: expected open|quiet');
		const dist = m['dist'];
		if (!isInt(dist) || dist < 0 || dist > 127) return err('bad_frame', 'markers[].dist: invalid bucket');
		const brng = m['brng'];
		if (!isInt(brng) || brng < 0 || brng > maxBrng) return err('bad_frame', 'markers[].brng: invalid bucket');
		markers.push({ handle, state, dist, brng });
	}
	return { ok: true, frame: { v: PROTOCOL_VERSION, op: 'markers', ts, markers } };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').AggregateFrame>}
 */
function parseAggregate(raw) {
	const ts = raw['ts'];
	if (!isTs(ts)) return err('bad_frame', 'aggregate.ts: invalid timestamp');
	const counts = raw['counts'];
	if (!isObj(counts)) return err('bad_frame', 'aggregate.counts: expected object');
	const open = counts['open'];
	if (!isInt(open) || open < 0 || open > 1_000_000) return err('bad_frame', 'aggregate.counts.open');
	const quiet = counts['quiet'];
	if (!isInt(quiet) || quiet < 0 || quiet > 1_000_000) return err('bad_frame', 'aggregate.counts.quiet');
	return { ok: true, frame: { v: PROTOCOL_VERSION, op: 'aggregate', ts, counts: { open, quiet } } };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {ParseResult<import('./types.js').ErrorFrame>}
 */
function parseError(raw) {
	const code = raw['code'];
	if (!isErrorCode(code)) {
		return err('bad_frame', 'error.code: unknown');
	}
	/** @type {string | undefined} */
	let msg;
	if (raw['msg'] !== undefined) {
		const m = raw['msg'];
		if (!isStr(m) || m.length > 256) return err('bad_frame', 'error.msg: invalid');
		msg = m;
	}
	/** @type {import('./types.js').ErrorFrame} */
	const frame = { v: PROTOCOL_VERSION, op: 'error', code };
	if (msg !== undefined) frame.msg = msg;
	return { ok: true, frame };
}

/**
 * Timestamp freshness. `offsetMs` is the client-minus-server clock offset
 * (computed once from hello-ack.serverTs). On the server, pass the offset so
 * the client's ts is compared in server time; on the client, pass 0.
 * @param {number} tsMs
 * @param {number} nowMs
 * @param {number} windowS
 * @param {number} [offsetMs]
 * @returns {boolean}
 */
export function isFresh(tsMs, nowMs, windowS, offsetMs = 0) {
	return Math.abs(nowMs - (tsMs - offsetMs)) <= windowS * 1000;
}
