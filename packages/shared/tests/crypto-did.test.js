import { describe, expect, it } from 'vitest';
import {
	bytesToB64Url,
	b64UrlToBytes,
	frameSigningPayload,
	signFrame,
	verifyFrameSig,
} from '../src/crypto.js';
import {
	base58btcDecode,
	base58btcEncode,
	compressEcp256,
	decompressEcp256,
	didToPublicBytes,
	didToVerifyKey,
	generateSessionKeyPair,
	isValidDidKeyP256,
	publicRawToDid,
} from '../src/did.js';

describe('base58btc', () => {
	it('round-trips arbitrary bytes including leading zeros', () => {
		for (const bytes of [new Uint8Array([0, 0, 1, 2, 255]), new Uint8Array([42]), crypto.getRandomValues(new Uint8Array(35))]) {
			const decoded = base58btcDecode(base58btcEncode(bytes));
			expect([...decoded]).toEqual([...bytes]);
		}
	});
});

describe('P-256 point compression', () => {
	it('round-trips random valid public keys', async () => {
		for (let i = 0; i < 5; i++) {
			const pair = await generateSessionKeyPair();
			// Re-export the raw public key (uncompressed) from the did path.
			const uncompressed = didToPublicBytes(pair.did);
			expect(uncompressed.length).toBe(65);
			const recompressed = compressEcp256(uncompressed);
			expect(recompressed.length).toBe(33);
			expect([...decompressEcp256(recompressed)]).toEqual([...uncompressed]);
		}
	});

	it('rejects points that are not on the curve', () => {
		// Deterministically find an x whose RHS is a non-residue mod p
		// (about half of x values are, so a random pick would flake).
		const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
		const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
		/** @param {bigint} base @param {bigint} exp @param {bigint} mod @returns {bigint} */
		const pow = (base, exp, mod) => {
			let r = 1n;
			let b = base % mod;
			let e = exp;
			while (e > 0n) {
				if (e & 1n) r = (r * b) % mod;
				b = (b * b) % mod;
				e >>= 1n;
			}
			return r;
		};
		let x = 1n;
		for (;;) {
			const rhs = (((((x * x) % P) * x) % P) - 3n * x + B + 2n * P) % P;
			const y0 = pow(rhs, (P + 1n) / 4n, P);
			if ((y0 * y0) % P !== rhs) break;
			x += 1n;
		}
		const bogus = new Uint8Array(33);
		bogus[0] = 0x02;
		for (let i = 0; i < 32; i++) bogus[i + 1] = Number((x >> BigInt(8 * (31 - i))) & 0xffn);
		let threw = false;
		try {
			decompressEcp256(bogus);
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
	});
});

describe('did:key', () => {
	it('builds a valid did from a raw public key and parses it back', async () => {
		const pair = await generateSessionKeyPair();
		expect(pair.did.startsWith('did:key:z')).toBe(true);
		expect(isValidDidKeyP256(pair.did)).toBe(true);
		expect(isValidDidKeyP256('did:key:znotakey')).toBe(false);
		expect(publicRawToDid(didToPublicBytes(pair.did))).toBe(pair.did);
	});
});

describe('frame signatures (ES256)', () => {
	it('signs and verifies, and rejects tampered frames', async () => {
		const pair = await generateSessionKeyPair();
		/** @type {Record<string, unknown>} */
		const frame = { v: 1, op: 'pos', lat: 52.5, lon: 13.4, accuracy: 5, ts: 1_700_000_000_000 };
		frame.sig = await signFrame(frame, pair.privateKey);
		const publicKey = await didToVerifyKey(pair.did);
		expect(await verifyFrameSig(frame, publicKey)).toBe(true);

		const tampered = { ...frame, lat: 52.6 };
		expect(await verifyFrameSig(tampered, publicKey)).toBe(false);
	});

	it('signing payload excludes sig and is canonical', () => {
		const a = frameSigningPayload({ v: 1, b: 2, a: 3, sig: 'x' });
		const b = frameSigningPayload({ a: 3, b: 2, v: 1 });
		expect([...a]).toEqual([...b]);
	});

	it('base64url helpers round-trip', () => {
		const bytes = crypto.getRandomValues(new Uint8Array(64));
		expect([...b64UrlToBytes(bytesToB64Url(bytes))]).toEqual([...bytes]);
	});
});
