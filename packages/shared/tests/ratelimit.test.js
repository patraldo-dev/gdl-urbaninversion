import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/presence/ratelimit.js';

describe('TokenBucket', () => {
	it('drains capacity then refuses, refills over time', () => {
		const b = new TokenBucket(3, 1, 0);
		expect(b.take(1_000)).toBe(true);
		expect(b.take(1_000)).toBe(true);
		expect(b.take(1_000)).toBe(true);
		expect(b.take(1_000)).toBe(false);
		// 1 token/s: after 2s two more fit.
		expect(b.take(3_000, 2)).toBe(true);
		expect(b.take(3_000)).toBe(false);
	});

	it('never exceeds capacity on long idle', () => {
		const b = new TokenBucket(5, 10, 0);
		expect(b.take(1_000_000, 100)).toBe(false);
		expect(b.take(1_000_000, 5)).toBe(true);
	});

	it('round-trips through toJSON/fromJSON (hibernation persistence)', () => {
		const b = new TokenBucket(10, 1, 0);
		b.take(5_000, 7);
		const restored = TokenBucket.fromJSON(10, 1, b.toJSON(), 5_000);
		expect(restored.take(5_000, 3)).toBe(true);
		expect(restored.take(5_000)).toBe(false);
	});
});
