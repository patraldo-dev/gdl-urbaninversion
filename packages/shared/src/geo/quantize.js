/**
 * Quantization of relative vectors into wire-safe buckets, plus the per-pair
 * dither that keeps quantization noise non-deterministic across handle
 * rotation epochs (a trilateration cost-raiser, not a fix — see docs).
 */

/**
 * Deterministic 32-bit FNV-1a.
 * @param {string} s
 * @returns {number}
 */
export function fnv1a32(s) {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * Distance bucket index with optional per-pair dither (meters).
 * @param {number} distM
 * @param {number} bucketM
 * @param {number} [ditherM]
 * @returns {number}
 */
export function distanceBucketIndex(distM, bucketM, ditherM = 0) {
	if (!(distM >= 0) || !(bucketM > 0)) throw new Error('distanceBucketIndex: invalid arguments');
	return Math.floor((distM + ditherM) / bucketM);
}

/**
 * Bearing bucket index with optional per-pair dither (degrees).
 * @param {number} bearing
 * @param {number} bucketDeg
 * @param {number} [ditherDeg]
 * @returns {number}
 */
export function bearingBucketIndex(bearing, bucketDeg, ditherDeg = 0) {
	if (!(bucketDeg > 0) || !Number.isInteger(360 / bucketDeg)) {
		throw new Error('bearingBucketIndex: bucketDeg must divide 360');
	}
	const n = Math.round(360 / bucketDeg);
	const b = ((((bearing + ditherDeg) % 360) + 360) % 360);
	return Math.floor(b / bucketDeg) % n;
}

/**
 * Representative center (meters) of a distance bucket, for rendering.
 * @param {number} index
 * @param {number} bucketM
 * @returns {number}
 */
export function bucketDistanceCenterM(index, bucketM) {
	return (index + 0.5) * bucketM;
}

/**
 * Representative center (degrees clockwise from north) of a bearing bucket, for rendering.
 * @param {number} index
 * @param {number} bucketDeg
 * @returns {number}
 */
export function bucketBearingCenterDeg(index, bucketDeg) {
	return (index + 0.5) * bucketDeg;
}

/**
 * Per-pair, per-epoch quantization dither. Stable within an epoch (so
 * consecutive frames agree), re-rolled every handle-rotation epoch (so
 * samples cannot be averaged across epochs to erase quantization noise).
 * `seed` combines the subject and observer session secrets server-side.
 * @param {string} seed
 * @param {number} epoch
 * @param {number} maxDitherM
 * @param {number} maxDitherDeg
 * @returns {{ dm: number, dd: number }}
 */
export function pairDither(seed, epoch, maxDitherM, maxDitherDeg) {
	const h1 = fnv1a32(`${seed}#dist#${epoch}`);
	const h2 = fnv1a32(`${seed}#brng#${epoch}`);
	return { dm: (h1 / 2 ** 32) * maxDitherM, dd: (h2 / 2 ** 32) * maxDitherDeg };
}
