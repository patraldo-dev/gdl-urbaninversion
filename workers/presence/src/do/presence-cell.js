import { DurableObject } from 'cloudflare:workers';
import {
	PROTOCOL_VERSION,
	isPlaceCell,
	TokenBucket,
	bearingBucketIndex,
	bearingDeg,
	bytesToB64Url,
	d1BucketStart,
	didToVerifyKey,
	distanceBucketIndex,
	encodeGeohash,
	fnv1a32,
	geohashNeighbors,
	handleEpoch,
	haversineM,
	isFresh,
	isValidGeohash,
	pairDither,
	parseClientFrame,
	verifyFrameSig,
} from '@urbaninversion/shared';
import { presenceConfig } from '../env.js';
import { verifyTurnstile } from '../turnstile.js';

/**
 * PresenceCell: one hibernating Durable Object per geohash cell.
 *
 * Hibernation contract (WebSocket Hibernation API):
 *  - The constructor re-runs on every wake, so it stays empty; the roster is
 *    rebuilt ONCE per wake from ctx.getWebSockets() + deserializeAttachment.
 *  - The attachment carries only small session metadata (did, state, role,
 *    blocks, coarse flag, clock offset). Positions are NEVER in the
 *    attachment — they live in the in-memory roster only and are re-sent by
 *    clients after a wake (≤ UPDATE_IDLE_S), per the documented behavior.
 *  - No setTimeout/setInterval anywhere; TTL purges and bucket flushes ride
 *    on ctx.storage alarms, which are only ever moved earlier.
 *
 * Privacy invariants enforced here:
 *  - Server→client frames carry rotating handles and quantized buckets only;
 *    never another member's coordinates or did.
 *  - OBSERVER state and degraded accuracy (worse than MIN_ACCURACY_M) both
 *    downgrade a member to aggregate-only — degrade, never reject.
 *  - Only the subject's HOME DO emits that subject's markers, so a pair is
 *    emitted exactly once even though both members hold sockets here.
 *  - INVISIBLE purges everything for the session and closes the socket.
 */

const CLOSE_AUTH = 4001;
const CLOSE_RATE = 4002;
const CLOSE_PROTOCOL = 4003;
const CLOSE_TTL = 4004;

// Per-socket frame budget: covers 0.5 Hz pos + occasional state/home/block.
const SOCKET_BUCKET_CAPACITY = 30;
const SOCKET_REFILL_PER_SEC = 5;

// Best-effort per-IP session limit, hashed with a rotating pepper, kept in
// memory only. Cross-cell per-IP limiting is future work; Turnstile is the
// primary session-creation control.
const IP_BUCKET_CAPACITY = 8;
const IP_REFILL_PER_SEC = 0.05;
const IP_PEPPER_ROTATION_S = 3_600;

const MAX_BLOCKS_PER_MEMBER = 64;
const SPEED_TOLERANCE = 2; // × MAX_SPEED_MPS, plus half the accuracy envelope
const DITHER_MAX_M = 2;
const DITHER_MAX_DEG = 6;
const BUCKET_REPORT_DELAY_MS = 2_000;
const MAX_SWEEP_MEMBERS = 250; // full O(n²) sweep cap; beyond this, sweeps truncate

/**
 * @typedef {object} MemberAttachment
 * @property {string} did
 * @property {import('@urbaninversion/shared').PresenceState} state
 * @property {import('@urbaninversion/shared').SubscriptionRole} role
 * @property {string[]} blocked Blocked member dids (session-scoped; dies with the socket).
 * @property {boolean} coarse Aggregate-only: observer state or accuracy worse than MIN_ACCURACY_M.
 * @property {number} clockOffsetMs Client-minus-server clock offset from the hello exchange.
 * @property {number} joinedMs
 */

/**
 * @typedef {object} Member
 * @property {WebSocket} ws
 * @property {string} did
 * @property {import('@urbaninversion/shared').PresenceState} state
 * @property {import('@urbaninversion/shared').SubscriptionRole} role
 * @property {Set<string>} blocked
 * @property {boolean} coarse
 * @property {number} clockOffsetMs
 * @property {number} joinedMs
 * @property {CryptoKey | undefined} [verifyKey]
 * @property {{ lat: number, lon: number, accuracy: number, tsMs: number } | undefined} [pos]
 * @property {TokenBucket} bucket
 * @property {string | undefined} [lastSentPayload]
 */

/**
 * @typedef {object} PendingFlush
 * @property {number} bucket
 * @property {string} parent
 * @property {number} open
 * @property {number} quiet
 * @property {number} observer
 */

export class PresenceCell extends DurableObject {
	/** @type {import('@urbaninversion/shared').PresenceConfig | undefined} */
	cfg = undefined;
	/** @type {string} */
	cell = '';
	/** @type {boolean} */
	rebuilt = false;
	/** @type {Map<WebSocket, Member>} */
	members = new Map();
	/** @type {Map<string, Member>} */
	byDid = new Map();
	/** @type {Map<WebSocket, string>} */
	pendingIp = new Map();
	/** @type {Map<number, TokenBucket>} */
	ipBuckets = new Map();
	/** @type {{ bucket: number, states: Map<string, import('@urbaninversion/shared').PresenceState> } | null} */
	bucketStates = null;
	/** @type {PendingFlush | null} */
	pendingFlush = null;
	/** @type {Map<string, string>} did → latest minted session ticket */
	sessionTickets = new Map();

	/**
	 * @param {DurableObjectState} ctx
	 * @param {import('../env.js').Env} env
	 */
	constructor(ctx, env) {
		super(ctx, env);
		// Deliberately light: re-runs on every wake.
	}

	/** @returns {import('@urbaninversion/shared').PresenceConfig} */
	config() {
		this.cfg ??= presenceConfig(/** @type {import('../env.js').Env} */ (this.env));
		return this.cfg;
	}

	// ---------------------------------------------------------------- routing

	/**
	 * @param {Request} request
	 * @returns {Promise<Response>}
	  * @override
	 */
	async fetch(request) {
		const cfg = this.config();
		const url = new URL(request.url);
		if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
		const cell = url.searchParams.get('cell') ?? '';
		if (!isValidGeohash(cell, cfg.GEOHASH_PRECISION) && !isPlaceCell(cell)) {
			return new Response('bad cell', { status: 400 });
		}
		if (this.cell === '') this.cell = cell;

		const ip = request.headers.get('x-ui-client-ip') ?? '';
		const pair = new WebSocketPair();
		const [client, server] = /** @type {[WebSocket, WebSocket]} */ (Object.values(pair));
		if (ip) this.pendingIp.set(server, ip);
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	// ------------------------------------------------------------ ws handlers

	/**
	 * @param {WebSocket} ws
	 * @param {string | ArrayBuffer} message
	  * @override
	 */
	async webSocketMessage(ws, message) {
		this.ensureRoster();
		const cfg = this.config();
		const now = Date.now();

		if (typeof message !== 'string') {
			this.sendError(ws, 'bad_frame', 'binary frames are not supported');
			return;
		}
		const member = this.members.get(ws);
		if (!member) {
			const parsed = parseClientFrame(message, cfg);
			if (!parsed.ok) {
				this.sendError(ws, parsed.code, parsed.msg);
				return;
			}
			if (parsed.frame.op !== 'hello') {
				this.sendError(ws, 'bad_frame', 'first frame must be hello');
				ws.close(CLOSE_PROTOCOL, 'expected hello');
				return;
			}
			await this.handleHello(ws, parsed.frame, now);
			return;
		}

		if (!member.bucket.take(now)) {
			this.sendError(ws, 'rate_limited', 'per-connection rate limit exceeded');
			ws.close(CLOSE_RATE, 'rate limited');
			return;
		}
		const parsed = parseClientFrame(message, cfg);
		if (!parsed.ok) {
			this.sendError(ws, parsed.code, parsed.msg);
			return;
		}
		if (parsed.frame.op === 'hello') {
			this.sendError(ws, 'bad_frame', 'hello already received on this socket');
			return;
		}
		let verifyKey = member.verifyKey;
		if (!verifyKey) {
			verifyKey = await didToVerifyKey(member.did).catch(() => undefined);
			if (verifyKey) member.verifyKey = verifyKey;
		}
		if (
			!verifyKey ||
			!(await verifyFrameSig(/** @type {Record<string, unknown>} */ (parsed.frame), verifyKey))
		) {
			this.sendError(ws, 'bad_sig', 'signature verification failed');
			return;
		}
		switch (parsed.frame.op) {
			case 'pos':
				this.handlePos(member, parsed.frame, now);
				break;
			case 'state':
				this.handleState(member, parsed.frame.state, now);
				break;
			case 'home':
				this.handleHome(member, parsed.frame.cell, now);
				break;
			case 'block':
				this.handleBlock(member, parsed.frame.handle, now);
				break;
		}
	}

	/** @param {WebSocket} ws  * @override
	 */
	async webSocketClose(ws) {
		this.ensureRoster();
		this.dropMember(ws, 'closed');
		await this.afterRosterChange(Date.now());
	}

	/** @param {WebSocket} ws  * @override
	 */
	async webSocketError(ws) {
		this.ensureRoster();
		this.dropMember(ws, 'error');
		await this.afterRosterChange(Date.now());
	}

	// ------------------------------------------------------------- hello/auth

	/**
	 * @param {WebSocket} ws
	 * @param {import('@urbaninversion/shared').HelloFrame} frame
	 * @param {number} now
	 */
	async handleHello(ws, frame, now) {
		const ip = this.pendingIp.get(ws) ?? '';
		this.pendingIp.delete(ws);

		if (ip) {
			const pepper = Math.floor(now / 1000 / IP_PEPPER_ROTATION_S);
			const hash = fnv1a32(`${ip}#${pepper}`);
			const tb = this.ipBuckets.get(hash) ?? new TokenBucket(IP_BUCKET_CAPACITY, IP_REFILL_PER_SEC, now);
			this.ipBuckets.set(hash, tb);
			if (!tb.take(now)) {
				this.sendError(ws, 'rate_limited', 'too many sessions from this network');
				ws.close(CLOSE_RATE, 'rate limited');
				return;
			}
			if (this.ipBuckets.size > 1_000) this.ipBuckets.clear();
		}

		const verifyKey = await didToVerifyKey(frame.did).catch(() => null);
		if (!verifyKey || !(await verifyFrameSig(/** @type {Record<string, unknown>} */ (frame), verifyKey))) {
			this.sendError(ws, 'bad_sig', 'hello signature invalid');
			ws.close(CLOSE_AUTH, 'bad signature');
			return;
		}
		const env = /** @type {import('../env.js').Env} */ (/** @type {unknown} */ (this.env));
		if (frame.pair !== undefined) {
			// Glasses pairing or session ticket: consume atomically in the
			// pairing DO (both are pt_ tickets; glasses ones were minted by a
			// phone vouch, session ones by a previous verified hello).
			const stub = env.PAIRING.get(env.PAIRING.idFromName('global'));
			const res = await stub.fetch(new Request(`https://do/consume?ticket=${encodeURIComponent(frame.pair)}`, { method: 'POST' }));
			const out = await res.json().catch(() => ({ ok: false }));
			if (!out['ok']) {
				this.sendError(ws, 'turnstile_failed', 'pairing ticket invalid');
				ws.close(CLOSE_AUTH, 'pairing');
				return;
			}
		} else if (!(await verifyTurnstile(frame.turnstile, env.TURNSTILE_SECRET ?? '', ip))) {
			this.sendError(ws, 'turnstile_failed', 'session challenge failed');
			ws.close(CLOSE_AUTH, 'turnstile');
			return;
		}

		// Mint a fresh session ticket on every verified hello: Turnstile
		// tokens are single-use at siteverify, so the client must switch to
		// ticket auth (hello.pair) for every subsequent socket — edge cells,
		// reconnects, place joins.
		try {
			const stub = env.PAIRING.get(env.PAIRING.idFromName('global'));
			const mint = await stub.fetch(new Request('https://do/mint', { method: 'POST' }));
			const out = await mint.json();
			if (typeof out['ticket'] === 'string') this.sessionTickets.set(frame.did, out['ticket']);
		} catch {
			// Ticket rotation is best-effort; the session keeps its old ticket.
		}
		if (frame.state === 'invisible') {
			// INVISIBLE never holds server state; the socket simply goes away.
			ws.close(CLOSE_PROTOCOL, 'invisible does not subscribe');
			return;
		}

		// Same session reconnecting to this cell: replace the old socket.
		const prev = this.byDid.get(frame.did);
		if (prev) this.dropMember(prev.ws, 'replaced');

		/** @type {MemberAttachment} */
		const attachment = {
			did: frame.did,
			state: frame.state,
			role: frame.role,
			blocked: [],
			coarse: frame.state === 'observer',
			clockOffsetMs: frame.ts - now,
			joinedMs: now,
		};
		ws.serializeAttachment(attachment);
		/** @type {Member} */
		const member = {
			ws,
			did: attachment.did,
			state: attachment.state,
			role: attachment.role,
			blocked: new Set(),
			coarse: attachment.coarse,
			clockOffsetMs: attachment.clockOffsetMs,
			joinedMs: attachment.joinedMs,
			verifyKey: verifyKey ?? undefined,
			bucket: new TokenBucket(SOCKET_BUCKET_CAPACITY, SOCKET_REFILL_PER_SEC, now),
		};
		this.members.set(ws, member);
		this.byDid.set(frame.did, member);
		this.noteBucketState(frame.did, frame.state);

		this.sendHelloAck(member, now);
		await this.afterRosterChange(now);
	}

	// ------------------------------------------------------------- frame ops

	/**
	 * @param {Member} member
	 * @param {import('@urbaninversion/shared').PosFrame} frame
	 * @param {number} now
	 */
	handlePos(member, frame, now) {
		const cfg = this.config();
		if (!isFresh(frame.ts, now, cfg.STALENESS_WINDOW_S, member.clockOffsetMs)) {
			this.sendError(member.ws, 'stale_ts', 'timestamp outside the freshness window');
			return;
		}
		const prev = member.pos;
		if (prev) {
			const dt = (frame.ts - prev.tsMs) / 1000;
			if (dt > 0.5) {
				const moved = haversineM(prev, frame);
				// Plausibility ceiling, not precision: teleports fail, GPS
				// jitter within the accuracy envelope passes.
				const allowed = cfg.MAX_SPEED_MPS * SPEED_TOLERANCE * dt + Math.max(prev.accuracy, frame.accuracy) / 2;
				if (moved > allowed) {
					this.sendError(member.ws, 'speed_violation', 'implausible movement');
					return;
				}
			}
		}
		const posCell = encodeGeohash(frame.lat, frame.lon, cfg.GEOHASH_PRECISION);
		const inScope = member.role === 'home' ? posCell === this.cell : this.isCellOrNeighbor(posCell);
		if (!inScope) {
			this.sendError(member.ws, 'cell_mismatch', 'position outside subscribed cells');
			return;
		}

		const wasCoarse = member.coarse;
		member.coarse = member.state === 'observer' || frame.accuracy > cfg.MIN_ACCURACY_M;
		member.pos = { lat: frame.lat, lon: frame.lon, accuracy: frame.accuracy, tsMs: frame.ts };
		if (member.coarse !== wasCoarse) {
			this.writeAttachment(member);
			this.sendHelloAck(member, now); // coarse flag changed: tell the client
		}
		this.sweep(now);
		void this.scheduleAlarm(now);
	}

	/**
	 * @param {Member} member
	 * @param {import('@urbaninversion/shared').PresenceState} state
	 * @param {number} now
	 */
	handleState(member, state, now) {
		if (state === 'invisible') {
			// Enter INVISIBLE: purge all state for this session, close.
			this.dropMember(member.ws, 'invisible');
			void this.afterRosterChange(now);
			return;
		}
		member.state = state;
		// Recompute coarse from the current truth: observer state, or (street
		// mode) GPS accuracy. Sticky-coarse kept former observers in
		// aggregate-only forever after flipping to open.
		member.coarse =
			state === 'observer' ||
			(!isPlaceCell(this.cell) &&
			 member.pos !== undefined &&
			 member.pos.accuracy > cfg.MIN_ACCURACY_M);
		this.noteBucketState(member.did, state);
		this.writeAttachment(member);
		this.sendHelloAck(member, now);
		this.sweep(now);
	}

	/**
	 * @param {Member} member
	 * @param {string} cell
	 * @param {number} now
	 */
	handleHome(member, cell, now) {
		if (cell !== this.cell) {
			this.sendError(member.ws, 'cell_mismatch', 'home frame belongs on that cell socket');
			return;
		}
		if (member.role === 'home') return;
		member.role = 'home';
		this.writeAttachment(member);
		this.sendHelloAck(member, now);
		this.sweep(now);
	}

	/**
	 * @param {Member} member
	 * @param {string} handle
	 * @param {number} now
	 */
	handleBlock(member, handle, now) {
		// Resolve the rotating handle to a member NOW, so handle rotation
		// cannot silently unblock someone mid-session.
		const target = [...this.members.values()].find((m) => this.handleFor(m, now) === handle);
		if (!target || target.did === member.did) return;
		if (member.blocked.size >= MAX_BLOCKS_PER_MEMBER) {
			const oldest = member.blocked.values().next().value;
			if (oldest !== undefined) member.blocked.delete(oldest);
		}
		member.blocked.add(target.did);
		this.writeAttachment(member);
		this.sweep(now);
	}

	// ------------------------------------------------------------- proximity

	/**
	 * Full-replacement sweep: every member with a fresh position receives
	 * either a markers frame (quantized, dithered, mutual-visibility rules
	 * applied) or an aggregate frame (coarse/observer). Identical payloads
	 * are not re-sent (deadband).
	 * @param {number} now
	 */
	sweep(now) {
		const cfg = this.config();
		const epoch = handleEpoch(now, cfg.HANDLE_ROTATION_S);
		if (isPlaceCell(this.cell)) return this.sweepPlace(now);
		const fresh = [...this.members.values()].filter(
			(m) => m.pos !== undefined && now - m.pos.tsMs <= cfg.POSITION_TTL_S * 1000
		);
		if (fresh.length > MAX_SWEEP_MEMBERS) fresh.length = MAX_SWEEP_MEMBERS;

		for (const observer of this.members.values()) {
			const opos = observer.pos;
			if (!opos) continue;
			if (observer.coarse) {
				let open = 0;
				let quiet = 0;
				for (const subject of fresh) {
					const spos = subject.pos;
					if (!spos || subject === observer || subject.role !== 'home') continue;
					if (haversineM(opos, spos) > cfg.PROXIMITY_RADIUS_M) continue;
					if (subject.state === 'open') open++;
					else if (subject.state === 'quiet') quiet++;
				}
				this.maybeSend(observer, { op: 'aggregate', counts: { open, quiet } });
				continue;
			}

			/** @type {{ dist: number, marker: import('@urbaninversion/shared').MarkerEntry }[]} */
			const collected = [];
			for (const subject of fresh) {
				const spos = subject.pos;
				if (!spos || subject === observer || subject.role !== 'home') continue;
				if (subject.state !== 'open' && subject.state !== 'quiet') continue;
				if (subject.state === 'quiet') {
					if (cfg.QUIET_VISIBILITY === 'aggregate') continue;
					if (cfg.QUIET_VISIBILITY === 'quiet_only' && observer.state !== 'quiet') continue;
				}
				// Blocks are enforced both directions (block = "hide from
				// each other"), which is the safer reading of session-scoped
				// block/mute.
				if (observer.blocked.has(subject.did) || subject.blocked.has(observer.did)) continue;
				const dist = haversineM(opos, spos);
				if (dist > cfg.PROXIMITY_RADIUS_M) continue;
				const dither = pairDither(`${subject.did}:${observer.did}`, epoch, DITHER_MAX_M, DITHER_MAX_DEG);
				collected.push({
					dist,
					marker: {
						handle: this.handleFor(subject, now),
						state: subject.state,
						dist: distanceBucketIndex(dist, cfg.DISTANCE_BUCKET_M, dither.dm),
						brng: bearingBucketIndex(bearingDeg(opos, spos), cfg.BEARING_BUCKET_DEG, dither.dd),
					},
				});
			}
			collected.sort((a, b) => a.dist - b.dist);
			const markers = collected.slice(0, cfg.MAX_MARKERS).map((c) => c.marker);
			this.maybeSend(observer, { op: 'markers', markers });
		}
	}

	/**
	 * Place rooms (cafés, gyms): everyone who joined IS here — no
	 * positions required, no distances. Observers get the aggregate;
	 * others get a roster (markers with dist/brng 0, join order) that
	 * clients render without distance text. Quiet visibility and blocks
	 * still apply.
	 * @param {number} now
	 */
	sweepPlace(now) {
		const cfg = this.config();
		const roster = [...this.members.values()].filter(
			(m) => m.role === 'home' && (m.state === 'open' || m.state === 'quiet')
		);
		for (const observer of this.members.values()) {
			if (observer.coarse) {
				let open = 0;
				let quiet = 0;
				for (const subject of roster) {
					if (subject === observer) continue;
					if (observer.blocked.has(subject.did) || subject.blocked.has(observer.did)) continue;
					if (subject.state === 'open') open++;
					else quiet++;
				}
				this.maybeSend(observer, { op: 'aggregate', counts: { open, quiet } });
				continue;
			}
			/** @type {import('@urbaninversion/shared').MarkerEntry[]} */
			const markers = [];
			for (const subject of roster) {
				if (subject === observer) continue;
				if (subject.state === 'quiet') {
					if (cfg.QUIET_VISIBILITY === 'aggregate') continue;
					if (cfg.QUIET_VISIBILITY === 'quiet_only' && observer.state !== 'quiet') continue;
				}
				if (observer.blocked.has(subject.did) || subject.blocked.has(observer.did)) continue;
				markers.push({ handle: this.handleFor(subject, now), state: subject.state, dist: 0, brng: 0 });
			}
			this.maybeSend(observer, { op: 'markers', markers: markers.slice(0, cfg.MAX_MARKERS) });
		}
	}

	/**
	 * Deterministic within an epoch, stable across DOs for one session
	 * (derived from the session did, which clients never see), unlinkable
	 * across epochs and sessions.
	 * @param {Member} member
	 * @param {number} now
	 * @returns {string}
	 */
	handleFor(member, now) {
		const epoch = handleEpoch(now, this.config().HANDLE_ROTATION_S);
		const h1 = fnv1a32(`${member.did}#h1#${epoch}`);
		const h2 = fnv1a32(`${member.did}#h2#${epoch}`);
		const bytes = new Uint8Array(8);
		const view = new DataView(bytes.buffer);
		view.setUint32(0, h1);
		view.setUint32(4, h2);
		return bytesToB64Url(bytes);
	}

	// -------------------------------------------------------------- outbound

	/**
	 * @param {Member} member
	 * @param {{ op: 'markers', markers: import('@urbaninversion/shared').MarkerEntry[] } | { op: 'aggregate', counts: { open: number, quiet: number } }} payload
	 */
	maybeSend(member, payload) {
		const key = JSON.stringify(payload);
		if (key === member.lastSentPayload) return;
		member.lastSentPayload = key;
		const frame = { v: PROTOCOL_VERSION, ...payload, ts: Date.now() };
		try {
			member.ws.send(JSON.stringify(frame));
		} catch {
			// Socket closing; webSocketClose will clean up.
		}
	}

	/**
	 * @param {Member} member
	 * @param {number} now
	 */
	sendHelloAck(member, now) {
		const cfg = this.config();
		/** @type {import('@urbaninversion/shared').HelloAckFrame} */
		const frame = {
			v: PROTOCOL_VERSION,
			op: 'hello-ack',
			cell: this.cell,
			role: member.role,
			serverTs: now,
			coarse: member.coarse,
			cfg: {
				distanceBucketM: cfg.DISTANCE_BUCKET_M,
				bearingBucketDeg: cfg.BEARING_BUCKET_DEG,
				proximityRadiusM: cfg.PROXIMITY_RADIUS_M,
				handleRotationS: cfg.HANDLE_ROTATION_S,
				minAccuracyM: cfg.MIN_ACCURACY_M,
				quietVisibility: cfg.QUIET_VISIBILITY,
			},
		};
		const ticket = this.sessionTickets.get(member.did);
		if (ticket) frame.pair = ticket;
		try {
			member.ws.send(JSON.stringify(frame));
		} catch {
			// Socket closing.
		}
	}

	/**
	 * @param {WebSocket} ws
	 * @param {import('@urbaninversion/shared').ErrorCode} code
	 * @param {string} msg
	 */
	sendError(ws, code, msg) {
		/** @type {import('@urbaninversion/shared').ErrorFrame} */
		const frame = { v: PROTOCOL_VERSION, op: 'error', code, msg };
		try {
			ws.send(JSON.stringify(frame));
		} catch {
			// Socket closing.
		}
	}

	// ------------------------------------------------------- roster lifecycle

	/** Rebuild in-memory state once per wake. Idempotent and cheap after. */
	ensureRoster() {
		if (this.rebuilt) return;
		this.rebuilt = true;
		const now = Date.now();
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment();
			if (!att || typeof att !== 'object' || !('did' in att)) continue; // connected but never said hello
			/** @type {MemberAttachment} */
			const a = att;
			/** @type {Member} */
			const member = {
				ws,
				did: a.did,
				state: a.state,
				role: a.role,
				blocked: new Set(a.blocked),
				coarse: a.coarse,
				clockOffsetMs: a.clockOffsetMs,
				joinedMs: a.joinedMs,
				bucket: new TokenBucket(SOCKET_BUCKET_CAPACITY, SOCKET_REFILL_PER_SEC, now),
			};
			// Positions are deliberately NOT restored: clients re-send within
			// UPDATE_IDLE_S and are invisible until then.
			this.members.set(ws, member);
			this.byDid.set(a.did, member);
		}
	}

	/**
	 * @param {Member} member
	 */
	writeAttachment(member) {
		/** @type {MemberAttachment} */
		const att = {
			did: member.did,
			state: member.state,
			role: member.role,
			blocked: [...member.blocked].slice(0, MAX_BLOCKS_PER_MEMBER),
			coarse: member.coarse,
			clockOffsetMs: member.clockOffsetMs,
			joinedMs: member.joinedMs,
		};
		member.ws.serializeAttachment(att);
	}

	/**
	 * @param {WebSocket} ws
	 * @param {string} _reason
	 */
	dropMember(ws, _reason) {
		const member = this.members.get(ws);
		this.pendingIp.delete(ws);
		if (!member) return;
		this.members.delete(ws);
		if (this.byDid.get(member.did) === member) this.byDid.delete(member.did);
		try {
			ws.close(1000, 'dropped');
		} catch {
			// Already closing.
		}
	}

	/**
	 * @param {number} now
	 */
	async afterRosterChange(now) {
		this.sweep(now);
		await this.scheduleAlarm(now);
	}

	/**
	 * @param {string} cell
	 * @returns {boolean}
	 */
	isCellOrNeighbor(cell) {
		if (cell === this.cell) return true;
		const n = geohashNeighbors(this.cell);
		return Object.values(n).includes(cell);
	}

	// ------------------------------------------------------ metrics & alarms

	/**
	 * @param {string} did
	 * @param {import('@urbaninversion/shared').PresenceState} state
	 */
	noteBucketState(did, state) {
		const cfg = this.config();
		const now = Date.now();
		const current = d1BucketStart(now, cfg.D1_BUCKET_S);
		if (!this.bucketStates || this.bucketStates.bucket < current) {
			// New bucket: seed from whoever is currently in the roster.
			/** @type {Map<string, import('@urbaninversion/shared').PresenceState>} */
			const states = new Map();
			for (const m of this.members.values()) states.set(m.did, m.state);
			this.bucketStates = { bucket: current, states };
		}
		if (state === 'invisible') this.bucketStates.states.delete(did);
		else this.bucketStates.states.set(did, state);
	}

	/** @override */
	async alarm() {
		this.ensureRoster();
		const cfg = this.config();
		const now = Date.now();

		// TTL purges (street cells only): stale positions close the socket
		// (webSocketClose cleans up the roster), members who never sent a
		// position are dropped. Place members carry no positions by design.
		if (!isPlaceCell(this.cell)) {
			for (const m of [...this.members.values()]) {
				if (m.pos && now - m.pos.tsMs > cfg.POSITION_TTL_S * 1000) {
					try {
						m.ws.close(CLOSE_TTL, 'position ttl expired');
					} catch {
						this.dropMember(m.ws, 'ttl');
					}
				}
			}
			for (const m of [...this.members.values()]) {
				if (!m.pos && now - m.joinedMs > cfg.POSITION_TTL_S * 2_000) {
					this.dropMember(m.ws, 'no position');
				}
			}
		}

		// Bucket close: report to the parent's MetricsRollup (retry slot).
		// Place rooms are deliberately excluded from street-cell metrics.
		const currentBucket = d1BucketStart(now, cfg.D1_BUCKET_S);
		if (!isPlaceCell(this.cell) && this.bucketStates && this.bucketStates.bucket < currentBucket) {
			let open = 0;
			let quiet = 0;
			let observer = 0;
			for (const state of this.bucketStates.states.values()) {
				if (state === 'open') open++;
				else if (state === 'quiet') quiet++;
				else if (state === 'observer') observer++;
			}
			this.pendingFlush = {
				bucket: this.bucketStates.bucket,
				parent: this.cell.slice(0, cfg.D1_GEOHASH_LEN),
				open,
				quiet,
				observer,
			};
			this.bucketStates = null;
			this.noteBucketState('', 'invisible'); // re-seeds from the live roster
		}
		if (this.pendingFlush) {
			const flushed = await this.reportToRollup(this.pendingFlush);
			if (flushed) this.pendingFlush = null; // else retried on next alarm
		}

		if (this.members.size === 0 && !this.bucketStates && !this.pendingFlush) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		this.sweep(now);
		await this.scheduleAlarm(now);
	}

	/**
	 * @param {PendingFlush} flush
	 * @returns {Promise<boolean>}
	 */
	async reportToRollup(flush) {
		try {
			const env = /** @type {import('../env.js').Env} */ (/** @type {unknown} */ (this.env));
			const stub = env.METRICS_ROLLUP.get(env.METRICS_ROLLUP.idFromName(flush.parent));
			const res = await stub.fetch('https://metrics-rollup.internal/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					bucket: flush.bucket,
					parent: flush.parent,
					child: this.cell,
					open: flush.open,
					quiet: flush.quiet,
					observer: flush.observer,
				}),
			});
			return res.status === 204;
		} catch {
			return false;
		}
	}

	/**
	 * Alarm = earliest of: next TTL expiry, next bucket close (+delay), flush
	 * retry. Only moved earlier.
	 * @param {number} now
	 */
	async scheduleAlarm(now) {
		const cfg = this.config();
		/** @type {number | null} */
		let next = null;
		for (const m of this.members.values()) {
			const due = m.pos
				? m.pos.tsMs + cfg.POSITION_TTL_S * 1000 + 500
				: m.joinedMs + cfg.POSITION_TTL_S * 2_000 + 500;
			if (next === null || due < next) next = due;
		}
		const bucketEnd =
			(this.bucketStates ? this.bucketStates.bucket : d1BucketStart(now, cfg.D1_BUCKET_S)) +
			cfg.D1_BUCKET_S;
		const bucketDue = bucketEnd * 1000 + BUCKET_REPORT_DELAY_MS;
		if (next === null || bucketDue < next) next = bucketDue;
		if (next <= now) next = now + 1;

		const current = await this.ctx.storage.getAlarm();
		if (current === null || current > next) await this.ctx.storage.setAlarm(next);
	}
}
