import { reset, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeGeohash, destination } from '@urbaninversion/shared';
import { connect, sendPos, stubFor, waitForMarkers } from './helpers.js';

/**
 * POSITION_TTL_S=5 and STALENESS_WINDOW_S=600 in the test bindings: a pos
 * frame with a 6-second-old timestamp passes the freshness window but is
 * already past the TTL — no sleeping required to simulate expiry.
 */

const CELL = 'u33d8v';
const CENTER = decodeGeohash(CELL);
const NORTH_20 = destination(CENTER, 0, 20);
const SOUTH_20 = destination(CENTER, 180, 20);

afterEach(async () => {
	await reset();
});

describe('position TTL', () => {
	it('stale positions drop out of the marker set', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon);
		const seen = await waitForMarkers(a, (m) => m.length === 1);
		expect(seen).not.toBeNull();

		// B "goes quiet": ts 6 s old — fresh enough (±600 s) but past TTL.
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon, { ts: Date.now() - 6_000 });
		await sendPos(a, NORTH_20.lat, NORTH_20.lon + 0.00001); // force a new sweep
		const after = await waitForMarkers(a, (m) => m.length === 0);
		expect(after).not.toBeNull();
	});

	it('the alarm closes sockets whose positions expired', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon, { ts: Date.now() - 6_000 });
		await waitForMarkers(a, (m) => m.length === 0);

		// Trigger the DO's alarm handler directly. The alarm was scheduled
		// in the past for an expired position, so the runtime may already
		// have fired it — the helper returning false is fine either way.
		await runDurableObjectAlarm(stubFor(CELL));
		const deadline = Date.now() + 8_000;
		while (!b.closed && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 25));
		}
		expect(b.closed).toBe(true);
		expect(a.closed).toBe(false);
	});
});
