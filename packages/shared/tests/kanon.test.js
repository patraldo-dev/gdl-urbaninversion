import { describe, expect, it } from 'vitest';
import { d1BucketStart, rollupThenSuppress } from '../src/presence/kanon.js';

describe('d1BucketStart', () => {
	it('aligns to 15-minute boundaries', () => {
		const t = Date.UTC(2026, 9, 20, 12, 7, 33);
		const b = d1BucketStart(t, 900);
		expect(b % 900).toBe(0);
		expect(new Date(b * 1000).toISOString()).toBe('2026-10-20T12:00:00.000Z');
	});
});

describe('rollupThenSuppress', () => {
	it('writes nothing when every parent stays under k', () => {
		const rows = rollupThenSuppress(
			[
				{ cell: 'u33d8v', open: 2, quiet: 1, observer: 0 },
				{ cell: 'u33d9c', open: 1, quiet: 0, observer: 0 },
			],
			5,
			4
		);
		expect(rows).toEqual([]);
	});

	it('rolls sparse children into a parent that clears k', () => {
		const rows = rollupThenSuppress(
			[
				{ cell: 'u33d8v', open: 2, quiet: 1, observer: 1 },
				{ cell: 'u33d9c', open: 1, quiet: 0, observer: 0 },
				{ cell: 'u33dbb', open: 3, quiet: 0, observer: 0 },
			],
			5,
			4
		);
		expect(rows).toHaveLength(1);
		expect(rows).toEqual([{ geohash: 'u33d', open: 6, quiet: 1, observer: 1 }]);
	});

	it('threshold counts observers too (they are also located by the row)', () => {
		const rows = rollupThenSuppress([{ cell: 'u33d8v', open: 1, quiet: 1, observer: 3 }], 5, 4);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.observer).toBe(3);
		const suppressed = rollupThenSuppress([{ cell: 'u33d8v', open: 1, quiet: 1, observer: 2 }], 5, 4);
		expect(suppressed).toEqual([]);
	});

	it('keeps separate parents apart and sorts deterministically', () => {
		const rows = rollupThenSuppress(
			[
				{ cell: 'u33d8v', open: 6, quiet: 0, observer: 0 },
				{ cell: 'u33zbc', open: 0, quiet: 6, observer: 0 },
			],
			5,
			4
		);
		expect(rows.map((r) => r.geohash)).toEqual(['u33d', 'u33z']);
	});
});
