import { describe, expect, it } from 'vitest';
import {
	bearingBucketIndex,
	bucketBearingCenterDeg,
	bucketDistanceCenterM,
	distanceBucketIndex,
	fnv1a32,
	pairDither,
} from '../src/geo/quantize.js';

describe('distance buckets', () => {
	it('buckets and centers are inverse up to half a bucket', () => {
		for (const d of [0, 1, 9.9, 10, 24.5, 59.9, 60]) {
			const idx = distanceBucketIndex(d, 10);
			const center = bucketDistanceCenterM(idx, 10);
			expect(Math.abs(center - d)).toBeLessThan(10);
			expect(idx).toBeGreaterThanOrEqual(0);
		}
	});

	it('dither only moves the boundary, not the resolution', () => {
		for (const d of [5, 15, 25, 55]) {
			const plain = distanceBucketIndex(d, 10);
			const dithered = distanceBucketIndex(d, 10, 1.9);
			expect(Math.abs(dithered - plain)).toBeLessThanOrEqual(1);
		}
	});
});

describe('bearing buckets', () => {
	it('wraps around north correctly', () => {
		expect(bearingBucketIndex(359, 45)).toBe(7);
		expect(bearingBucketIndex(0, 45)).toBe(0);
		expect(bearingBucketIndex(44.9, 45)).toBe(0);
		expect(bearingBucketIndex(45, 45)).toBe(1);
	});

	it('centers are within half a bucket of the input', () => {
		for (const b of [0, 90, 180, 271]) {
			const idx = bearingBucketIndex(b, 45);
			expect(Math.abs(bucketBearingCenterDeg(idx, 45) - b)).toBeLessThanOrEqual(22.5);
		}
	});

	it('rejects buckets that do not divide 360', () => {
		expect(() => bearingBucketIndex(10, 50)).toThrow();
	});
});

describe('pairDither', () => {
	it('is deterministic per seed+epoch and varies across epochs', () => {
		const a = pairDither('s1:s2', 100, 2, 6);
		const b = pairDither('s1:s2', 100, 2, 6);
		expect(a).toEqual(b);
		let differs = 0;
		for (let e = 100; e < 130; e++) {
			const other = pairDither('s1:s2', e, 2, 6);
			if (other.dm !== a.dm || other.dd !== a.dd) differs++;
		}
		expect(differs).toBeGreaterThan(20);
	});

	it('stays within the configured maxima', () => {
		for (let i = 0; i < 100; i++) {
			const d = pairDither(`seed-${i}`, i, 2, 6);
			expect(d.dm).toBeGreaterThanOrEqual(0);
			expect(d.dm).toBeLessThan(2);
			expect(d.dd).toBeGreaterThanOrEqual(0);
			expect(d.dd).toBeLessThan(6);
		}
	});

	it('differs between pairs in the same epoch', () => {
		const a = pairDither('observerA:subject', 7, 2, 6);
		const b = pairDither('observerB:subject', 7, 2, 6);
		expect(a.dm !== b.dm || a.dd !== b.dd).toBe(true);
	});
});

describe('fnv1a32', () => {
	it('is deterministic and 32-bit', () => {
		const h = fnv1a32('urban-inversion');
		expect(h).toBe(fnv1a32('urban-inversion'));
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThanOrEqual(0xffffffff);
		expect(fnv1a32('urban-inversioN')).not.toBe(h);
	});
});
