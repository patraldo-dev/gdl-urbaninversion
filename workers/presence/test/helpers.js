import { env } from 'cloudflare:workers';
import { PROTOCOL_VERSION, generateSessionKeyPair, signFrame } from '@urbaninversion/shared';

/**
 * Client-side test harness for PresenceCell: opens a real hibernating
 * WebSocket into the DO, signs frames with a fresh session key, and records
 * every server frame. Tests call DOs directly (stub.fetch), bypassing the
 * Worker's Origin check — that check has its own coverage via config tests
 * and the runbook smoke tests.
 */

/**
 * @typedef {object} TestClient
 * @property {WebSocket} ws
 * @property {string} cell
 * @property {'home' | 'edge'} role
 * @property {string} state
 * @property {{ did: string, privateKey: CryptoKey }} keypair
 * @property {any[]} frames
 * @property {boolean} closed
 * @property {number} accuracy
 */

/** @param {string} cell */
export function stubFor(cell) {
	const ns = env.PRESENCE_CELL;
	return ns.get(ns.idFromName(cell));
}

/**
 * @param {string} cell
 * @param {{ role?: 'home' | 'edge', state?: string, accuracy?: number }} [opts]
 * @returns {Promise<TestClient>}
 */
export async function connect(cell, opts = {}) {
	const role = opts.role ?? 'home';
	const state = opts.state ?? 'open';
	const res = await stubFor(cell).fetch(`https://presence.test/ws?cell=${cell}`, {
		headers: { upgrade: 'websocket' },
	});
	const ws = res.webSocket;
	if (!ws) throw new Error('upgrade failed');
	ws.accept();
	const keypair = await generateSessionKeyPair();
	/** @type {TestClient} */
	const client = { ws, cell, role, state, keypair, frames: [], closed: false, accuracy: opts.accuracy ?? 8 };
	ws.addEventListener('message', (ev) => {
		try {
			client.frames.push(JSON.parse(/** @type {string} */ (ev.data)));
		} catch {
			// ignore
		}
	});
	ws.addEventListener('close', () => {
		client.closed = true;
	});
	await sendFrame(client, {
		v: PROTOCOL_VERSION,
		op: 'hello',
		did: keypair.did,
		state,
		cell,
		role,
		turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
		cfg: { v: PROTOCOL_VERSION, geohashPrecision: 6 },
		ts: Date.now(),
	});
	await waitFor(client, (f) => f.op === 'hello-ack', 20_000);
	return client;
}

/**
 * @param {TestClient} client
 * @param {Record<string, unknown>} frame
 */
export async function sendFrame(client, frame) {
	frame.sig = await signFrame(frame, client.keypair.privateKey);
	client.ws.send(JSON.stringify(frame));
}

/**
 * @param {TestClient} client
 * @param {number} lat
 * @param {number} lon
 * @param {{ accuracy?: number, ts?: number, heading?: number, speed?: number }} [opts]
 */
export async function sendPos(client, lat, lon, opts = {}) {
	/** @type {Record<string, unknown>} */
	const frame = {
		v: PROTOCOL_VERSION,
		op: 'pos',
		lat,
		lon,
		accuracy: opts.accuracy ?? client.accuracy,
		ts: opts.ts ?? Date.now(),
	};
	if (opts.heading !== undefined) frame.heading = opts.heading;
	if (opts.speed !== undefined) frame.speed = opts.speed;
	await sendFrame(client, frame);
}

/**
 * Resolve once any recorded frame matches pred.
 * @param {TestClient} client
 * @param {(f: any) => boolean} pred
 * @param {number} [timeoutMs]
 */
export async function waitFor(client, pred, timeoutMs = 8_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = client.frames.find(pred);
		if (found) return found;
		if (Date.now() > deadline) throw new Error(`waitFor timed out; frames: ${JSON.stringify(client.frames.slice(-6))}`);
		await new Promise((r) => setTimeout(r, 25));
	}
}

/**
 * Wait until the LATEST markers frame satisfies contains(), then return it.
 * Returns the latest frame at timeout (possibly null) so tests can assert.
 * @param {TestClient} client
 * @param {(markers: any[]) => boolean} contains
 * @param {number} [timeoutMs]
 */
export async function waitForMarkers(client, contains, timeoutMs = 8_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const frames = client.frames.filter((f) => f.op === 'markers');
		const last = frames.length > 0 ? frames[frames.length - 1] : null;
		if (last && contains(last.markers)) return last;
		if (Date.now() > deadline) return last;
		await new Promise((r) => setTimeout(r, 25));
	}
}

/**
 * Signed frame with a WRONG key — for bad_sig coverage.
 * @param {TestClient} client
 * @param {Record<string, unknown>} frame
 */
export async function sendWrongSig(client, frame) {
	const other = await generateSessionKeyPair();
	frame.sig = await signFrame(frame, other.privateKey);
	client.ws.send(JSON.stringify(frame));
}
