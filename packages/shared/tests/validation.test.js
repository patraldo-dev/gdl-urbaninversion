import { describe, expect, it } from 'vitest';
import { generateSessionKeyPair, bytesToB64Url } from '../src/index.js';
import { parseClientFrame, parseServerFrame, isFresh } from '../src/validation.js';
import { defaultConfig } from '../src/config.js';

/** @param {import('../src/validation.js').ParseResult<any>} r @returns {string | undefined} */
const code = (r) => (r.ok ? undefined : r.code);

const cfg = defaultConfig;
const SIG = bytesToB64Url(crypto.getRandomValues(new Uint8Array(64)));

async function validHello(overrides = {}) {
	const pair = await generateSessionKeyPair();
	return {
		v: 1,
		op: 'hello',
		did: pair.did,
		state: 'open',
		cell: 'u33d8v',
		role: 'home',
		turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
		cfg: { v: 1, geohashPrecision: cfg.GEOHASH_PRECISION },
		ts: Date.now(),
		sig: SIG,
		...overrides,
	};
}

describe('parseClientFrame — hello', () => {
	it('accepts a valid hello', async () => {
		const res = parseClientFrame(JSON.stringify(await validHello()), cfg);
		expect(res.ok).toBe(true);
	});

	it('rejects wrong version, unknown op, bad JSON, non-string', async () => {
		const hello = await validHello();
		expect(code(parseClientFrame(JSON.stringify({ ...hello, v: 2 }), cfg))).toBe('bad_version');
		expect(code(parseClientFrame(JSON.stringify({ ...hello, op: 'nope' }), cfg))).toBe('bad_frame');
		expect(code(parseClientFrame('{oops', cfg))).toBe('bad_frame');
		expect(code(parseClientFrame(42, cfg))).toBe('bad_frame');
	});

	it('rejects precision mismatch as cfg_mismatch and bad cells', async () => {
		const hello = await validHello({ cfg: { v: 1, geohashPrecision: 5 } });
		expect(code(parseClientFrame(JSON.stringify(hello), cfg))).toBe('cfg_mismatch');
		const short = await validHello({ cell: 'u33d8' });
		expect(code(parseClientFrame(JSON.stringify(short), cfg))).toBe('bad_cell');
	});

	it('rejects invalid states, dids, sigs, oversized frames', async () => {
		expect(code(parseClientFrame(JSON.stringify(await validHello({ state: 'sneaky' })), cfg))).toBe('bad_state');
		expect(code(parseClientFrame(JSON.stringify(await validHello({ did: 'did:key:zbad' })), cfg))).toBe('bad_frame');
		expect(code(parseClientFrame(JSON.stringify(await validHello({ sig: '!!' })), cfg))).toBe('bad_sig');
		const big = 'x'.repeat(cfg.MAX_FRAME_BYTES + 1);
		expect(code(parseClientFrame(big, cfg))).toBe('oversized');
	});
});

describe('parseClientFrame — pos/state/home/block', () => {
	it('validates ranges and optional fields', () => {
		const pos = { v: 1, op: 'pos', lat: 52.5, lon: 13.4, accuracy: 8, ts: Date.now(), sig: SIG };
		expect(parseClientFrame(JSON.stringify(pos), cfg).ok).toBe(true);
		expect(code(parseClientFrame(JSON.stringify({ ...pos, lat: 91 }), cfg))).toBe('bad_frame');
		expect(code(parseClientFrame(JSON.stringify({ ...pos, accuracy: 0 }), cfg))).toBe('bad_frame');
		expect(code(parseClientFrame(JSON.stringify({ ...pos, heading: 360 }), cfg))).toBe('bad_frame');
		expect(code(parseClientFrame(JSON.stringify({ ...pos, ts: 0 }), cfg))).toBe('bad_frame');

		const withOptional = { ...pos, heading: 120, speed: 1.4 };
		const parsed = parseClientFrame(JSON.stringify(withOptional), cfg);
		expect(parsed.ok && parsed.frame.op === 'pos' && parsed.frame.heading === 120 && parsed.frame.speed === 1.4).toBe(true);
	});

	it('state/home/block round-trip and validate', () => {
		expect(parseClientFrame(JSON.stringify({ v: 1, op: 'state', state: 'quiet', ts: Date.now(), sig: SIG }), cfg).ok).toBe(true);
		expect(code(parseClientFrame(JSON.stringify({ v: 1, op: 'state', state: 'loud', ts: Date.now(), sig: SIG }), cfg))).toBe('bad_state');
		expect(parseClientFrame(JSON.stringify({ v: 1, op: 'home', cell: 'u33d8v', ts: Date.now(), sig: SIG }), cfg).ok).toBe(true);
		expect(code(parseClientFrame(JSON.stringify({ v: 1, op: 'home', cell: 'aaaaaa', ts: Date.now(), sig: SIG }), cfg))).toBe('bad_cell');
		expect(code(parseClientFrame(JSON.stringify({ v: 1, op: 'block', handle: 'abc', ts: Date.now(), sig: SIG }), cfg))).toBe('bad_frame');
	});
});

describe('parseServerFrame', () => {
	it('validates hello-ack, markers bounds, aggregate, error codes', () => {
		const ack = {
			v: 1,
			op: 'hello-ack',
			cell: 'u33d8v',
			role: 'home',
			serverTs: Date.now(),
			coarse: false,
			cfg: {
				distanceBucketM: 10,
				bearingBucketDeg: 45,
				proximityRadiusM: 60,
				handleRotationS: 300,
				minAccuracyM: 30,
				quietVisibility: 'everyone',
			},
		};
		expect(parseServerFrame(JSON.stringify(ack), cfg).ok).toBe(true);
		expect(code(parseServerFrame(JSON.stringify({ ...ack, coarse: 'yes' }), cfg))).toBe('bad_frame');

		const markers = { v: 1, op: 'markers', ts: Date.now(), markers: [{ handle: 'AAAAAAAAaa', state: 'open', dist: 3, brng: 2 }] };
		expect(parseServerFrame(JSON.stringify(markers), cfg).ok).toBe(true);
		const tooMany = { ...markers, markers: Array.from({ length: cfg.MAX_MARKERS + 1 }, () => markers.markers[0]) };
		expect(code(parseServerFrame(JSON.stringify(tooMany), cfg))).toBe('bad_frame');
		const badBrng = { ...markers, markers: [{ handle: 'AAAAAAAAaa', state: 'open', dist: 3, brng: 9 }] };
		expect(code(parseServerFrame(JSON.stringify(badBrng), cfg))).toBe('bad_frame');

		expect(parseServerFrame(JSON.stringify({ v: 1, op: 'aggregate', ts: Date.now(), counts: { open: 2, quiet: 1 } }), cfg).ok).toBe(true);
		expect(parseServerFrame(JSON.stringify({ v: 1, op: 'error', code: 'rate_limited', msg: 'slow down' }), cfg).ok).toBe(true);
		expect(code(parseServerFrame(JSON.stringify({ v: 1, op: 'error', code: 'meh' }), cfg))).toBe('bad_frame');
	});
});

describe('isFresh', () => {
	it('applies the clock offset within the window', () => {
		const now = Date.now();
		expect(isFresh(now, now, 30)).toBe(true);
		expect(isFresh(now - 31_000, now, 30)).toBe(false);
		// Client 10s fast (offset = clientMinusServer = +10s): a frame sent
		// "now" carries ts ≈ now+10s and must read as fresh after offset.
		expect(isFresh(now + 25_000, now, 30, 10_000)).toBe(true);
		expect(isFresh(now + 50_000, now, 30, 10_000)).toBe(false);
	});
});
