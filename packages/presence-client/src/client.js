import {
	PROTOCOL_VERSION,
	defaultConfig,
	distanceToCellEdgeM,
	encodeGeohash,
	generateSessionKeyPair,
	geohashNeighbors,
	parseServerFrame,
	signFrame,
} from '@urbaninversion/shared';

/**
 * PresenceClient: the signed WebSocket protocol client.
 *
 * Dual subscription (Phase 1 design): one socket per subscribed cell — the
 * home cell (role 'home', emits our markers via that DO) plus any adjacent
 * cell whose shared edge is within EDGE_MARGIN_M (role 'edge'), with an
 * EDGE_HYSTERESIS_M band so boundary walking does not flap. Position frames
 * go to every connected socket. Home-cell crossings promote an existing
 * edge socket with a 'home' frame, close the old home socket, and open an
 * edge socket to the old cell if still within margin.
 *
 * INVISIBLE: closes every socket and keeps nothing — the server holds zero
 * state for this user by construction.
 */

/**
 * @typedef {object} PresenceClientOptions
 * @property {import('@urbaninversion/shared').PresenceConfig} cfg
 * @property {string} [wsBase] Defaults to same-origin (`wss://host/ws`).
 * @property {string} [turnstileToken] From the pre-session DOM page (Phase 1 correction 4).
 * @property {import('@urbaninversion/shared').DeviceProfile} [dev] Capability block sent in hello.
 * @property {string} [pairTicket] Phone-pairing ticket (pt_...) — sent as hello.pair instead of turnstile.
 * @property {(kind: string, detail?: unknown) => void} [onEvent]
 */

/**
 * @typedef {object} CellSocket
 * @property {WebSocket} ws
 * @property {string} cell
 * @property {'home' | 'edge'} role
 * @property {boolean} helloSent
 * @property {number} backoffMs
 * @property {ReturnType<typeof setTimeout> | null} retryTimer
 * @property {string[]} queued
 */

const MAX_BACKOFF_MS = 30_000;
const SEND_QUEUE_LIMIT = 8;

export class PresenceClient {
	/** @param {PresenceClientOptions} options */
	constructor(options) {
		this.cfg = options.cfg;
		this.onEvent = options.onEvent ?? (() => {});
		this.wsBase = options.wsBase ?? presenceWsUrl();
		this.turnstileToken = options.turnstileToken; // Turnstile token (dev fallback keeps old dummy only when no pairing ticket either)
		this.pairTicket = options.pairTicket;
		this.dev = options.dev;
		/** @type {CryptoKey | null} */
		this.privateKey = null;
		this.did = '';
		/** @type {import('@urbaninversion/shared').PresenceState} */
		this.state = 'observer';
		this.clockOffsetMs = 0;
		this.coarse = false;
		this.closedByUser = false;
		/** @type {Map<string, CellSocket>} */
		this.sockets = new Map();
		/** @type {import('@urbaninversion/shared').LatLon | null} */
		this.lastPos = null;
	}

	/** Generate the ephemeral session key. Resolves with the did. @returns {Promise<string>} */
	async start() {
		const pair = await generateSessionKeyPair();
		this.privateKey = pair.privateKey;
		this.did = pair.did;
		return this.did;
	}

	/**
	 * @param {import('./providers.js').LocationFix} fix
	 */
	async updatePosition(fix) {
		if (!this.privateKey || this.closedByUser) return;
		const pos = { lat: fix.lat, lon: fix.lon };
		const homeCell = encodeGeohash(fix.lat, fix.lon, this.cfg.GEOHASH_PRECISION);

		await this.ensureHomeSocket(homeCell);
		await this.reconcileEdgeSockets(pos, homeCell);

		/** @type {Record<string, unknown>} */
		const frame = {
			v: PROTOCOL_VERSION,
			op: 'pos',
			lat: fix.lat,
			lon: fix.lon,
			accuracy: fix.accuracy,
			ts: fix.tsMs,
		};
		if (fix.heading !== undefined) frame.heading = fix.heading;
		if (fix.speed !== undefined) frame.speed = fix.speed;
		await this.broadcast(frame);
		this.lastPos = pos;
	}

	/**
	 * @param {import('@urbaninversion/shared').PresenceState} state
	 */
	async setState(state) {
		this.state = state;
		if (state === 'invisible') {
			this.close();
			return;
		}
		await this.broadcast({ v: PROTOCOL_VERSION, op: 'state', state, ts: Date.now() });
	}

	/** @param {string} handle */
	async block(handle) {
		await this.broadcast({ v: PROTOCOL_VERSION, op: 'block', handle, ts: Date.now() });
	}

	close() {
		this.closedByUser = true;
		for (const rec of this.sockets.values()) {
			if (rec.retryTimer) clearTimeout(rec.retryTimer);
			try {
				rec.ws.close(1000, 'client close');
			} catch {
				// Already closing.
			}
		}
		this.sockets.clear();
		this.onEvent('closed');
	}

	// ------------------------------------------------------------------ cells

	/** @param {string} homeCell */
	async ensureHomeSocket(homeCell) {
		const current = this.sockets.get(homeCell);
		if (current && current.role === 'home') return;
		if (current && current.role === 'edge') {
			// Promote: emission duty moves to this cell's DO.
			current.role = 'home';
			await this.sendSigned(current, { v: PROTOCOL_VERSION, op: 'home', cell: homeCell, ts: Date.now() });
			return;
		}
		const oldHome = [...this.sockets.values()].find((r) => r.role === 'home');
		this.connect(homeCell, 'home');
		if (oldHome) {
			this.sockets.delete(oldHome.cell);
			if (oldHome.retryTimer) clearTimeout(oldHome.retryTimer);
			try {
				oldHome.ws.close(1000, 'home cell changed');
			} catch {
				// Already closing.
			}
			// Re-subscribe to the old cell as edge if still near its edge.
			if (this.lastPos && distanceToCellEdgeM(this.lastPos, oldHome.cell) < this.cfg.EDGE_MARGIN_M + this.cfg.EDGE_HYSTERESIS_M) {
				this.connect(oldHome.cell, 'edge');
			}
		}
	}

	/**
	 * @param {import('@urbaninversion/shared').LatLon} pos
	 * @param {string} homeCell
	 */
	async reconcileEdgeSockets(pos, homeCell) {
		const neighbors = geohashNeighbors(homeCell);
		/** @type {Set<string>} */
		const wanted = new Set();
		for (const cell of Object.values(neighbors)) {
			const edgeDist = distanceToCellEdgeM(pos, cell);
			const existing = this.sockets.get(cell);
			const unsubAt = this.cfg.EDGE_MARGIN_M + this.cfg.EDGE_HYSTERESIS_M;
			if (existing && edgeDist > unsubAt) {
				this.disconnect(cell);
			} else if (!existing && edgeDist < this.cfg.EDGE_MARGIN_M) {
				wanted.add(cell);
			}
		}
		// Corner cases can want up to 3 edges; cap total sockets.
		for (const cell of wanted) {
			if (this.sockets.size >= this.cfg.MAX_SOCKETS_PER_CLIENT) break;
			this.connect(cell, 'edge');
		}
	}

	/** @param {string} cell */
	disconnect(cell) {
		const rec = this.sockets.get(cell);
		if (!rec) return;
		this.sockets.delete(cell);
		if (rec.retryTimer) clearTimeout(rec.retryTimer);
		try {
			rec.ws.close(1000, 'unsubscribed');
		} catch {
			// Already closing.
		}
	}

	/**
	 * @param {string} cell
	 * @param {'home' | 'edge'} role
	 */
	connect(cell, role) {
		if (this.sockets.has(cell)) return;
		const url = `${this.wsBase}?cell=${encodeURIComponent(cell)}`;
		const ws = new WebSocket(url);
		/** @type {CellSocket} */
		const rec = { ws, cell, role, helloSent: false, backoffMs: 1_000, retryTimer: null, queued: [] };
		this.sockets.set(cell, rec);
		ws.addEventListener('open', () => {
			this.onEvent('socket-open', cell);
			void this.sendHello(rec);
		});
		ws.addEventListener('message', (ev) => this.onMessage(rec, ev.data));
		ws.addEventListener('close', () => this.onClose(rec));
		ws.addEventListener('error', () => this.onEvent('socket-error', cell));
	}

	/** @param {CellSocket} rec */
	async sendHello(rec) {
		/** @type {Record<string, unknown>} */
		const frame = {
			v: PROTOCOL_VERSION,
			op: 'hello',
			did: this.did,
			state: this.state,
			cell: rec.cell,
			role: rec.role,
			turnstile: this.pairTicket ?? this.turnstileToken ?? 'XXXX.DUMMY.TOKEN.XXXX',
			cfg: { v: PROTOCOL_VERSION, geohashPrecision: this.cfg.GEOHASH_PRECISION },
			ts: Date.now(),
		};
		if (this.pairTicket) {
			delete frame['turnstile'];
			frame['pair'] = this.pairTicket;
		}
		if (this.dev) frame['dev'] = this.dev;
		await this.sendSigned(rec, frame);
		rec.helloSent = true;
		for (const queued of rec.queued.splice(0, SEND_QUEUE_LIMIT)) {
			rec.ws.send(queued);
		}
	}

	/**
	 * @param {CellSocket} rec
	 * @param {unknown} data
	 */
	onMessage(rec, data) {
		const parsed = parseServerFrame(typeof data === 'string' ? data : '', this.cfg);
		if (!parsed.ok) {
			this.onEvent('bad-server-frame', parsed.code);
			return;
		}
		const frame = parsed.frame;
		switch (frame.op) {
			case 'hello-ack':
				this.clockOffsetMs = Date.now() - frame.serverTs;
				if (frame.coarse !== this.coarse) {
					this.coarse = frame.coarse;
					this.onEvent('coarse-changed', frame.coarse);
				}
				this.onEvent('hello-ack', frame);
				break;
			case 'markers':
				this.onEvent('markers', frame.markers);
				break;
			case 'aggregate':
				this.onEvent('aggregate', frame.counts);
				break;
			case 'error':
				this.onEvent('server-error', frame);
				if (frame.code === 'origin_forbidden' || frame.code === 'cfg_mismatch') this.close();
				break;
		}
	}

	/** @param {CellSocket} rec */
	onClose(rec) {
		if (!this.sockets.has(rec.cell) || this.closedByUser) return;
		this.sockets.delete(rec.cell);
		rec.backoffMs = Math.min(MAX_BACKOFF_MS, rec.backoffMs * 2 + Math.random() * 500);
		rec.retryTimer = setTimeout(() => {
			// Reconnect to whatever role makes sense at the next position
			// update; a bare reconnect keeps the old role.
			this.connect(rec.cell, rec.role);
		}, rec.backoffMs);
		this.onEvent('socket-closed', rec.cell);
	}

	/**
	 * Sign and send a frame on one socket. Frames arriving before the hello
	 * is signed are queued (the server requires hello first).
	 * @param {CellSocket} rec
	 * @param {Record<string, unknown>} frame
	 */
	async sendSigned(rec, frame) {
		if (!this.privateKey) return;
		const sig = await signFrame(frame, this.privateKey);
		frame.sig = sig;
		const text = JSON.stringify(frame);
		if (rec.helloSent || frame['op'] === 'hello') rec.ws.send(text);
		else if (rec.queued.length < SEND_QUEUE_LIMIT) rec.queued.push(text);
	}

	/** @param {Record<string, unknown>} frame */
	async broadcast(frame) {
		for (const rec of this.sockets.values()) {
			await this.sendSigned(rec, frame);
		}
	}
}

/** @returns {string} */
function presenceWsUrl() {
	const loc = globalThis.location;
	if (!loc) return 'ws://localhost:8787/ws';
	const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
	return `${scheme}://${loc.host}/ws`;
}
