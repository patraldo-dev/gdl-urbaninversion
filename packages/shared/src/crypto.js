import { canonicalize } from './canonical.js';

/**
 * ES256 signatures (ECDSA P-256 + SHA-256). WebCrypto's ECDSA produces the
 * raw P1363 r||s form, which is exactly JWS "ES256" — so signatures are
 * base64url, 64 bytes → 86 chars. Works unchanged in browsers, Workers, and
 * Vitest (node:crypto webcrypto).
 */
const ECDSA_PARAMS = { name: 'ECDSA', hash: 'SHA-256' };

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToB64Url(bytes) {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} s
 * @returns {Uint8Array}
 */
export function b64UrlToBytes(s) {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isB64Url(s) {
	return /^[A-Za-z0-9_-]+$/.test(s);
}

/**
 * Canonical signing payload of a frame: the frame minus its `sig` field, canonicalized.
 * @param {Record<string, unknown>} frame
 * @returns {Uint8Array}
 */
export function frameSigningPayload(frame) {
	const { sig: _dropped, ...rest } = frame;
	return new TextEncoder().encode(canonicalize(rest));
}

/**
 * @param {Record<string, unknown>} frame
 * @param {CryptoKey} privateKey
 * @returns {Promise<string>}
 */
export async function signFrame(frame, privateKey) {
	const sig = await crypto.subtle.sign(ECDSA_PARAMS, privateKey, /** @type {BufferSource} */ (frameSigningPayload(frame)));
	return bytesToB64Url(new Uint8Array(sig));
}

/**
 * @param {Record<string, unknown>} frame
 * @param {CryptoKey} publicKey
 * @returns {Promise<boolean>}
 */
export async function verifyFrameSig(frame, publicKey) {
	const sig = frame['sig'];
	if (typeof sig !== 'string' || !isB64Url(sig)) return false;
	try {
		return await crypto.subtle.verify(
			ECDSA_PARAMS,
			publicKey,
			/** @type {BufferSource} */ (b64UrlToBytes(sig)),
			/** @type {BufferSource} */ (frameSigningPayload(frame))
		);
	} catch {
		return false;
	}
}
