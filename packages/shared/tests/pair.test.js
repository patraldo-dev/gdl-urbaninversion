import { describe, expect, it } from 'vitest';
import { generateSessionKeyPair, bytesToB64Url } from '../src/index.js';
import { parseClientFrame } from '../src/validation.js';
import { defaultConfig } from '../src/config.js';

const cfg = defaultConfig;
const SIG = bytesToB64Url(crypto.getRandomValues(new Uint8Array(64)));
const TICKET = 'pt_abcdefghij1234567890abcdefghij123';

async function pairHello(overrides = {}) {
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

/** @param {import('../src/validation.js').ParseResult<any>} r @returns {string | undefined} */
const code = (r) => (r.ok ? undefined : r.code);

describe('parseClientFrame — hello pair ticket (glasses pairing)', () => {
	it('accepts a valid pair ticket in place of turnstile', async () => {
		const hello = await pairHello({ turnstile: undefined, pair: TICKET });
		const r = parseClientFrame(JSON.stringify(hello), cfg);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const f = /** @type {import('../src/types.js').HelloFrame} */ (r.frame);
			expect(f.pair).toBe(TICKET);
			expect(f.turnstile).toBeUndefined();
		}
	});

	it('rejects pair and turnstile together (XOR)', async () => {
		const hello = await pairHello({ pair: TICKET });
		expect(code(parseClientFrame(JSON.stringify(hello), cfg))).toBe('bad_frame');
	});

	it('rejects neither (no human check at all)', async () => {
		const hello = await pairHello({ turnstile: undefined });
		expect(code(parseClientFrame(JSON.stringify(hello), cfg))).toBe('bad_frame');
	});

	it('rejects malformed tickets', async () => {
		for (const bad of ['pt_short', 'nope', 'pt_' + 'x'.repeat(70), 42]) {
			const hello = await pairHello({ turnstile: undefined, pair: /** @type {any} */ (bad) });
			expect(code(parseClientFrame(JSON.stringify(hello), cfg))).toBe('bad_frame');
		}
	});
});
