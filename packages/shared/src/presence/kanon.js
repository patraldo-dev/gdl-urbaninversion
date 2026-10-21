/**
 * k-anonymity for D1 flushes: roll sparse child cells up to their parent
 * geohash, then suppress rows that still do not clear the threshold.
 * Counts only — no identifiers, no positions, ever.
 *
 * Threshold note: the check uses the TOTAL (open + quiet + observer) per
 * rolled-up row. Phase 1 said open+quiet; total is strictly safer, because a
 * row keyed by (bucket, geohash) also reveals the coarse location of every
 * observer counted in it. Veto if you want the Phase 1 semantics.
 */

/**
 * @typedef {object} CellCounts
 * @property {string} cell Live-cell geohash (length = GEOHASH_PRECISION).
 * @property {number} open
 * @property {number} quiet
 * @property {number} observer
 */

/**
 * @typedef {object} KAnonRow
 * @property {string} geohash Parent geohash (length = D1_GEOHASH_LEN).
 * @property {number} open
 * @property {number} quiet
 * @property {number} observer
 */

/**
 * Align a unix-ms timestamp down to a bucket boundary, in unix seconds.
 * @param {number} tsMs
 * @param {number} bucketS
 * @returns {number}
 */
export function d1BucketStart(tsMs, bucketS) {
	return Math.floor(tsMs / 1000 / bucketS) * bucketS;
}

/**
 * @param {readonly CellCounts[]} cells
 * @param {number} k
 * @param {number} parentLen
 * @returns {KAnonRow[]}
 */
export function rollupThenSuppress(cells, k, parentLen) {
	/** @type {Map<string, KAnonRow>} */
	const byParent = new Map();
	for (const c of cells) {
		if (c.cell.length <= parentLen) continue;
		const key = c.cell.slice(0, parentLen);
		const row = byParent.get(key) ?? { geohash: key, open: 0, quiet: 0, observer: 0 };
		row.open += c.open;
		row.quiet += c.quiet;
		row.observer += c.observer;
		byParent.set(key, row);
	}
	return [...byParent.values()]
		.filter((r) => r.open + r.quiet + r.observer >= k)
		.sort((a, b) => (a.geohash < b.geohash ? -1 : a.geohash > b.geohash ? 1 : 0));
}
