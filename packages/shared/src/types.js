/**
 * Wire types for the presence protocol (v1).
 *
 * Every frame is a JSON object with `v` (PROTOCOL_VERSION) and `op`.
 * Client frames are signed (ES256) by the session's ephemeral did:key;
 * `sig` covers the canonical form of the frame with `sig` removed.
 *
 * Privacy invariants encoded here:
 *  - Server-to-client frames never contain another user's coordinates, did,
 *    or stable identifier — only rotating opaque handles plus quantized
 *    distance/bearing buckets.
 *  - INVISIBLE is never a wire state in practice: the client disconnects.
 *    It is accepted on `state` frames only so the server can treat it as an
 *    immediate goodbye and purge everything for that session.
 */

/** @typedef {'open' | 'quiet' | 'observer' | 'invisible'} PresenceState */

/** @type {readonly PresenceState[]} */
export const PRESENCE_STATES = ['open', 'quiet', 'observer', 'invisible'];

/** States that make a member individually visible to others. @type {readonly ('open' | 'quiet')[]} */
export const VISIBLE_STATES = ['open', 'quiet'];

/** Role of a socket within its cell's Durable Object (dual subscription). @typedef {'home' | 'edge'} SubscriptionRole */

/**
 * Protocol-relevant config the client echoes in `hello`; server rejects mismatches.
 * @typedef {object} HelloConfigClient
 * @property {number} v
 * @property {number} geohashPrecision
 */

/**
 * Server config echo in `hello-ack`, for client-side rendering/de-quantization.
 * @typedef {object} HelloConfigServer
 * @property {number} distanceBucketM
 * @property {number} bearingBucketDeg
 * @property {number} proximityRadiusM
 * @property {number} handleRotationS
 * @property {number} minAccuracyM
 * @property {import('./config.js').QuietVisibility} quietVisibility
 */

/**
 * @typedef {object} HelloFrame
 * @property {number} v
 * @property {'hello'} op
 * @property {string} did Session's ephemeral public key, did:key (P-256, compressed point).
 * @property {PresenceState} state
 * @property {string} cell Home geohash cell this socket is subscribing to.
 * @property {SubscriptionRole} role
 * @property {string} turnstile Turnstile token obtained on the pre-session DOM page.
 * @property {HelloConfigClient} cfg
 * @property {number} ts
 * @property {string} sig
 */

/**
 * @typedef {object} PosFrame
 * @property {number} v
 * @property {'pos'} op
 * @property {number} lat
 * @property {number} lon
 * @property {number} accuracy Reported accuracy radius in meters.
 * @property {number} [heading] Optional heading in degrees [0, 360).
 * @property {number} [speed] Optional speed in m/s.
 * @property {number} ts
 * @property {string} sig
 */

/**
 * @typedef {object} StateFrame
 * @property {number} v
 * @property {'state'} op
 * @property {PresenceState} state
 * @property {number} ts
 * @property {string} sig
 */

/**
 * Home-cell change: tells this socket's DO that the member's home cell is now
 * `cell` (emission-duty swap during a cell crossing). Only valid on a socket
 * whose role is 'home'.
 * @typedef {object} HomeFrame
 * @property {number} v
 * @property {'home'} op
 * @property {string} cell
 * @property {number} ts
 * @property {string} sig
 */

/**
 * Session-scoped block: stop sending me this handle's markers. Resolved to a
 * member at receive time (handles rotate), so rotation does not unblock.
 * @typedef {object} BlockFrame
 * @property {number} v
 * @property {'block'} op
 * @property {string} handle
 * @property {number} ts
 * @property {string} sig
 */

/** @typedef {HelloFrame | PosFrame | StateFrame | HomeFrame | BlockFrame} ClientFrame */

/**
 * @typedef {object} HelloAckFrame
 * @property {number} v
 * @property {'hello-ack'} op
 * @property {string} cell
 * @property {SubscriptionRole} role
 * @property {number} serverTs Server unix ms at send time (clock offset source).
 * @property {boolean} coarse True when this client receives aggregates only (OBSERVER or accuracy worse than MIN_ACCURACY_M).
 * @property {HelloConfigServer} cfg
 */

/**
 * One nearby person. `dist`/`brng` are quantized bucket indices, never raw values.
 * @typedef {object} MarkerEntry
 * @property {string} handle
 * @property {'open' | 'quiet'} state
 * @property {number} dist Distance bucket index (multiples of distanceBucketM, with per-pair dither).
 * @property {number} brng Bearing bucket index (multiples of bearingBucketDeg, with per-pair dither).
 */

/**
 * Full-replacement marker set for the receiving client. Each frame is the
 * complete current view; clients diff against their previous set, so TTL
 * expiry and departures need no explicit "gone" message.
 * @typedef {object} MarkersFrame
 * @property {number} v
 * @property {'markers'} op
 * @property {number} ts
 * @property {MarkerEntry[]} markers
 */

/**
 * Aggregate counts for OBSERVER / coarse clients (k-anonymity applies to D1, not live).
 * @typedef {object} AggregateFrame
 * @property {number} v
 * @property {'aggregate'} op
 * @property {number} ts
 * @property {{ open: number, quiet: number }} counts
 */

/**
 * @typedef {object} ErrorFrame
 * @property {number} v
 * @property {'error'} op
 * @property {ErrorCode} code
 * @property {string} [msg]
 */

/** @typedef {HelloAckFrame | MarkersFrame | AggregateFrame | ErrorFrame} ServerFrame */

/**
 * @typedef {'bad_frame'
 * 	| 'bad_version'
 * 	| 'bad_state'
 * 	| 'bad_cell'
 * 	| 'bad_sig'
 * 	| 'stale_ts'
 * 	| 'oversized'
 * 	| 'cfg_mismatch'
 * 	| 'turnstile_failed'
 * 	| 'rate_limited'
 * 	| 'speed_violation'
 * 	| 'cell_mismatch'
 * 	| 'origin_forbidden'
 * 	| 'geo_sanity'
 * 	| 'server_error'
 * } ErrorCode
 */
