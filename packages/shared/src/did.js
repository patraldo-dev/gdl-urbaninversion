/**
 * did:key for P-256 public keys (compressed-point encoding).
 *
 * did = "did:key:z" + base58btc( varint(p256-pub) || compressedPoint )
 * where multicodec p256-pub = 0x1200, varint-encoded as bytes [0x80, 0x24].
 *
 * Scope, stated plainly for docs: did:key here provides message integrity
 * and a self-sovereign per-session pseudonym *within this protocol*. It does
 * NOT provide durable identity, Sybil resistance, or cross-vendor
 * discoverability — no shipping headset OS resolves DIDs today.
 */

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const DID_KEY_PREFIX = 'did:key:z';
const MULTICODEC_P256_PUB = new Uint8Array([0x80, 0x24]);

const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base58btcEncode(bytes) {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	let s = '';
	while (n > 0n) {
		s = B58_ALPHABET.charAt(Number(n % 58n)) + s;
		n /= 58n;
	}
	for (const b of bytes) {
		if (b === 0) s = `1${s}`;
		else break;
	}
	return s;
}

/**
 * @param {string} s
 * @returns {Uint8Array}
 */
export function base58btcDecode(s) {
	let n = 0n;
	for (const ch of s) {
		const i = B58_ALPHABET.indexOf(ch);
		if (i < 0) throw new Error('base58btc: invalid character');
		n = n * 58n + BigInt(i);
	}
	/** @type {number[]} */
	const bytes = [];
	while (n > 0n) {
		bytes.unshift(Number(n % 256n));
		n /= 256n;
	}
	let zeros = 0;
	for (const ch of s) {
		if (ch === '1') zeros++;
		else break;
	}
	return new Uint8Array([...Array.from({ length: zeros }, () => 0), ...bytes]);
}

/**
 * @param {Uint8Array} bytes
 * @returns {bigint}
 */
function bytesToBigInt(bytes) {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

/**
 * @param {bigint} n
 * @param {Uint8Array} out
 * @returns {void}
 */
function bigIntToFixedBytes(n, out) {
	if (n < 0n || n >= 1n << BigInt(out.length * 8)) throw new Error('bigIntToFixedBytes: out of range');
	for (let i = out.length - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
}

/**
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} mod
 * @returns {bigint}
 */
function modPow(base, exp, mod) {
	let result = 1n;
	let b = base % mod;
	let e = exp;
	while (e > 0n) {
		if (e & 1n) result = (result * b) % mod;
		b = (b * b) % mod;
		e >>= 1n;
	}
	return result;
}

/**
 * 65-byte uncompressed (0x04 || X || Y) → 33-byte compressed (0x02/0x03 || X).
 * @param {Uint8Array} uncompressed
 * @returns {Uint8Array}
 */
export function compressEcp256(uncompressed) {
	if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
		throw new Error('compressEcp256: expected 65-byte uncompressed point');
	}
	const out = new Uint8Array(33);
	const yByte = uncompressed[64];
	out[0] = yByte !== undefined && yByte % 2 === 0 ? 0x02 : 0x03;
	out.set(uncompressed.subarray(1, 33), 1);
	return out;
}

/**
 * 33-byte compressed → 65-byte uncompressed. Throws if the point is not on P-256.
 * @param {Uint8Array} compressed
 * @returns {Uint8Array}
 */
export function decompressEcp256(compressed) {
	if (compressed.length !== 33 || (compressed[0] !== 0x02 && compressed[0] !== 0x03)) {
		throw new Error('decompressEcp256: expected 33-byte compressed point');
	}
	const x = bytesToBigInt(compressed.subarray(1));
	if (x >= P256_P) throw new Error('decompressEcp256: x out of field range');
	const xCubed = (((x * x) % P256_P) * x) % P256_P;
	const rhs = (((xCubed - 3n * x + P256_B) % P256_P) + P256_P) % P256_P;
	const y0 = modPow(rhs, (P256_P + 1n) / 4n, P256_P);
	if ((y0 * y0) % P256_P !== rhs) throw new Error('decompressEcp256: point not on curve');
	const wantOdd = compressed[0] === 0x03;
	const y = (y0 % 2n === 1n) === wantOdd ? y0 : P256_P - y0;
	const out = new Uint8Array(65);
	out[0] = 0x04;
	bigIntToFixedBytes(x, out.subarray(1, 33));
	bigIntToFixedBytes(y, out.subarray(33, 65));
	return out;
}

/**
 * @param {Uint8Array} rawUncompressed
 * @returns {string}
 */
export function publicRawToDid(rawUncompressed) {
	const bytes = new Uint8Array(MULTICODEC_P256_PUB.length + 33);
	bytes.set(MULTICODEC_P256_PUB, 0);
	bytes.set(compressEcp256(rawUncompressed), MULTICODEC_P256_PUB.length);
	return DID_KEY_PREFIX + base58btcEncode(bytes);
}

/**
 * Returns the 65-byte uncompressed public key bytes for a P-256 did:key.
 * @param {string} did
 * @returns {Uint8Array}
 */
export function didToPublicBytes(did) {
	if (!did.startsWith(DID_KEY_PREFIX)) throw new Error('didToPublicBytes: not a did:key');
	const bytes = base58btcDecode(did.slice(DID_KEY_PREFIX.length));
	if (bytes.length !== 35 || bytes[0] !== 0x80 || bytes[1] !== 0x24) {
		throw new Error('didToPublicBytes: not a compressed P-256 did:key');
	}
	return decompressEcp256(bytes.subarray(2));
}

/**
 * @param {string} did
 * @returns {boolean}
 */
export function isValidDidKeyP256(did) {
	try {
		didToPublicBytes(did);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} did
 * @returns {Promise<CryptoKey>}
 */
export async function didToVerifyKey(did) {
	return crypto.subtle.importKey('raw', didToPublicBytes(did), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
		'verify',
	]);
}

/**
 * Fresh ephemeral session keypair plus its did:key. Nothing here is persisted.
 * @returns {Promise<{ privateKey: CryptoKey, did: string }>}
 */
export async function generateSessionKeyPair() {
	const pair = /** @type {CryptoKeyPair} */ (
		await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
	);
	const raw = new Uint8Array(/** @type {ArrayBuffer} */ (await crypto.subtle.exportKey('raw', pair.publicKey)));
	return { privateKey: pair.privateKey, did: publicRawToDid(raw) };
}
