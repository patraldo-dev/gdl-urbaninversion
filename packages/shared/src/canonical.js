/**
 * Deterministic canonicalization for frame signatures.
 *
 * A practical subset of RFC 8785 (JCS): object keys sorted lexicographically
 * at every level, no whitespace, undefined fields dropped, and every number
 * must be finite (JSON.stringify's number formatting is used as-is, which
 * matches JCS for the integers and ordinary decimals this protocol carries).
 * Both signer and verifier run this exact function, so the subset is
 * self-consistent by construction.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
	return JSON.stringify(prepare(value));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function prepare(value) {
	if (value === null) return null;
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return value;
		case 'number':
			if (!Number.isFinite(value)) {
				throw new Error('canonicalize: non-finite number');
			}
			return value;
		case 'object': {
			if (Array.isArray(value)) return value.map(prepare);
			const src = /** @type {Record<string, unknown>} */ (value);
			/** @type {Record<string, unknown>} */
			const out = {};
			for (const key of Object.keys(src).sort()) {
				const v = src[key];
				if (v === undefined) continue;
				out[key] = prepare(v);
			}
			return out;
		}
		default:
			throw new Error(`canonicalize: unsupported type ${typeof value}`);
	}
}
