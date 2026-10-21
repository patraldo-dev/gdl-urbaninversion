import { reset } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeGeohash, destination, haversineM } from '@urbaninversion/shared';
import { connect, sendPos, waitForMarkers } from './helpers.js';

/**
 * Trilateration limits (Phase 1 honesty, verified): a single adversary
 * moving between vantage points and collecting quantized bearing/distance
 * buckets cannot pin a stationary target's position — the reconstruction
 * error stays bounded below by the quantization floor. The adversary also
 * only knows its own GPS fix (σ 5 m noise), like a real attacker.
 */

const CELL = 'u33d8v';
const TARGET = decodeGeohash(CELL);
const VANTAGE_DIST_M = 35;
const N_VANTAGES = 6;

afterEach(async () => {
	await reset();
});

describe('trilateration limits', () => {
	it('multi-vantage reconstruction stays off by the quantization floor', async () => {
		const adversary = await connect(CELL);
		const target = await connect(CELL);
		await sendPos(target, TARGET.lat, TARGET.lon);

		/** @type {{ lat: number, lon: number }[]} */
		const estimates = [];
		for (let i = 0; i < N_VANTAGES; i++) {
			const bearing = (i * 360) / N_VANTAGES;
			// The attacker knows a noisy fix of its own position.
			const truePos = destination(TARGET, bearing, VANTAGE_DIST_M);
			const known = {
				lat: truePos.lat + (Math.sin(i * 2.7) * 5) / 111_320,
				lon: truePos.lon + (Math.cos(i * 1.9) * 5) / (111_320 * Math.cos((truePos.lat * Math.PI) / 180)),
			};
			await sendPos(adversary, known.lat, known.lon);
			const frame = await waitForMarkers(adversary, (m) => m.length === 1, 4_000);
			if (!frame) throw new Error('no marker observed');
			const marker = frame.markers[0];
			const dist = (marker.dist + 0.5) * 10; // bucket center, meters
			const brng = (marker.brng + 0.5) * 45; // bucket center, degrees
			estimates.push(destination(known, brng, dist));
			// Nudge so the next sweep produces a fresh frame.
			await sendPos(adversary, known.lat + 1e-6, known.lon);
		}

		const mean = estimates.reduce(
			(acc, p) => ({ lat: acc.lat + p.lat / estimates.length, lon: acc.lon + p.lon / estimates.length }),
			{ lat: 0, lon: 0 }
		);
		const errorM = haversineM(mean, TARGET);

		// Roughly right (sanity that the protocol works at all)…
		expect(errorM).toBeLessThan(35);
		// …but never pinpointable: quantization + dither + GPS noise keep
		// the reconstruction meters away from the truth.
		expect(errorM).toBeGreaterThan(2);
	});
});
