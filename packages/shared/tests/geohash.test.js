import { describe, expect, it } from 'vitest';
import { decodeGeohash, distanceToCellEdgeM, encodeGeohash, geohashBBox, geohashNeighbors, isValidGeohash } from '../src/geo/geohash.js';
import { destination, haversineM } from '../src/geo/math.js';

describe('encodeGeohash', () => {
	it('matches the classic reference encoding', () => {
		// Widely-cited example point (Jutland, DK).
		expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
	});

	it('clamps out-of-range coordinates', () => {
		expect(encodeGeohash(91, 181, 6)).toBe(encodeGeohash(90, 180, 6));
	});

	it('rejects invalid precision', () => {
		expect(() => encodeGeohash(0, 0, 0)).toThrow();
		expect(() => encodeGeohash(0, 0, 13)).toThrow();
	});
});

describe('geohashBBox / decode', () => {
	it('cell bbox contains the encoded point and is ~cell-sized', () => {
		const lat = 52.5208;
		const lon = 13.4045;
		/** @type {Record<number, number>} */
		const maxCenterDist = { 4: 25_000, 5: 3_500, 6: 700 };
		for (const precision of [4, 5, 6]) {
			const gh = encodeGeohash(lat, lon, precision);
			const b = geohashBBox(gh);
			expect(lat).toBeGreaterThanOrEqual(b.minLat);
			expect(lat).toBeLessThanOrEqual(b.maxLat);
			expect(lon).toBeGreaterThanOrEqual(b.minLon);
			expect(lon).toBeLessThanOrEqual(b.maxLon);
			const center = decodeGeohash(gh);
			expect(haversineM({ lat, lon }, center)).toBeLessThan(maxCenterDist[precision] ?? 700);
		}
	});
});

describe('geohashNeighbors', () => {
	it('every neighbor differs, centers sit one cell away, and adjacency is symmetric', () => {
		const gh = encodeGeohash(52.5208, 13.4045, 6);
		const n = geohashNeighbors(gh);
		const values = Object.values(n);
		expect(new Set(values).size).toBe(8);
		expect(values).not.toContain(gh);
		for (const nb of values) {
			expect(Object.values(geohashNeighbors(nb))).toContain(gh);
		}
		// The east neighbor's center is east of ours.
		const c = decodeGeohash(gh);
		const e = decodeGeohash(n.e);
		expect(e.lon).toBeGreaterThan(c.lon);
		expect(e.lat).toBeCloseTo(c.lat, 6);
	});
});

describe('distanceToCellEdgeM', () => {
	it('is ~half the cell extent at the center and ~0 at the edge', () => {
		const gh = encodeGeohash(52.5208, 13.4045, 6);
		const b = geohashBBox(gh);
		const center = decodeGeohash(gh);
		const atCenter = distanceToCellEdgeM(center, gh);
		expect(atCenter).toBeGreaterThan(150);
		expect(atCenter).toBeLessThan(650);
		const onEastEdge = { lat: center.lat, lon: b.maxLon - 1e-7 };
		expect(distanceToCellEdgeM(onEastEdge, gh)).toBeLessThan(5);
	});
});

describe('geo math', () => {
	it('haversine and destination are mutually consistent', () => {
		const a = { lat: 52.52, lon: 13.4 };
		const b = destination(a, 47, 850);
		expect(haversineM(a, b)).toBeCloseTo(850, -1.5);
	});
});

describe('isValidGeohash', () => {
	it('validates charset and length', () => {
		expect(isValidGeohash('u33d8v', 6)).toBe(true);
		expect(isValidGeohash('u33d8v', 5)).toBe(false);
		expect(isValidGeohash('u33d8a', 6)).toBe(false); // 'a' is not in base32
		expect(isValidGeohash('', 6)).toBe(false);
	});
});
