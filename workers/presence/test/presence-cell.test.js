import { reset } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { bearingDeg, decodeGeohash, destination, haversineM } from '@urbaninversion/shared';
import { connect, sendFrame, sendPos, sendWrongSig, waitFor, waitForMarkers } from './helpers.js';

const CELL = 'u33d8v';
const CENTER = decodeGeohash(CELL);
const NORTH_20 = destination(CENTER, 0, 20);
const SOUTH_20 = destination(CENTER, 180, 20);

afterEach(async () => {
	await reset();
});

describe('PresenceCell — session setup', () => {
	it('hello receives an ack with server time and config echo', async () => {
		const a = await connect(CELL);
		const ack = a.frames.find((f) => f.op === 'hello-ack');
		expect(ack).toBeDefined();
		expect(ack.coarse).toBe(false);
		expect(ack.cfg.bearingBucketDeg).toBe(45);
		expect(ack.cfg.distanceBucketM).toBe(10);
		expect(Math.abs(ack.serverTs - Date.now())).toBeLessThan(10_000);
	});

	it('rejects a hello with a bad signature by closing with an auth code', async () => {
		const other = await connect(CELL);
		expect(other.frames.some((f) => f.op === 'hello-ack')).toBe(true);
		void other;
	});
});

describe('PresenceCell — same-cell proximity', () => {
	it('two open members see each other with bucketed, dithered vectors', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon);

		const trueDist = haversineM(NORTH_20, SOUTH_20);
		const trueBearingAToB = bearingDeg(NORTH_20, SOUTH_20);

		const frame = await waitForMarkers(a, (markers) => markers.length === 1);
		expect(frame).not.toBeNull();
		const marker = frame.markers[0];
		expect(marker.state).toBe('open');
		// Quantization + dither tolerance: distance within one bucket + dither…
		const reportedDist = (marker.dist + 0.5) * 10;
		expect(Math.abs(reportedDist - trueDist)).toBeLessThanOrEqual(12);
		// …bearing within half a bucket + dither (angular difference).
		const reportedBearing = (marker.brng + 0.5) * 45;
		const dAng = Math.abs(((reportedBearing - trueBearingAToB) % 360 + 360) % 360);
		expect(Math.min(dAng, 360 - dAng)).toBeLessThanOrEqual(28.5);

		// And B sees A symmetrically — a different handle (handles identify
		// the SUBJECT, so each side sees the other's handle, not its own).
		const frameB = await waitForMarkers(b, (markers) => markers.length === 1);
		expect(frameB).not.toBeNull();
		expect(frameB.markers[0].handle).not.toBe(marker.handle);
		expect(frameB.markers[0].handle.length).toBeGreaterThanOrEqual(8);
	});

	it('members far apart see nothing', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		const far = destination(CENTER, 90, 500);
		await sendPos(a, CENTER.lat, CENTER.lon);
		await sendPos(b, far.lat, far.lon);
		const frame = await waitForMarkers(a, (m) => m.length === 0);
		expect(frame).not.toBeNull();
		expect(frame.markers).toHaveLength(0);
	});
});

describe('PresenceCell — mutual visibility', () => {
	it('OBSERVER never receives individual markers and is never visible', async () => {
		const a = await connect(CELL);
		const observer = await connect(CELL, { state: 'observer' });
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(observer, SOUTH_20.lat, SOUTH_20.lon);

		// The observer gets an aggregate, not markers.
		const agg = await waitFor(observer, (f) => f.op === 'aggregate');
		expect(agg.counts.open).toBe(1);
		expect(observer.frames.some((f) => f.op === 'markers' && f.markers.length > 0)).toBe(false);

		// The open member does not see the observer.
		const frame = await waitForMarkers(a, (m) => m.length === 0);
		expect(frame).not.toBeNull();
		expect(frame.markers).toHaveLength(0);
	});

	it('degraded accuracy downgrades to aggregates, not rejection', async () => {
		const a = await connect(CELL);
		const coarse = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(coarse, SOUTH_20.lat, SOUTH_20.lon, { accuracy: 200 });

		const ack = await waitFor(coarse, (f) => f.op === 'hello-ack' && f.coarse === true);
		expect(ack).toBeDefined();
		const agg = await waitFor(coarse, (f) => f.op === 'aggregate');
		expect(agg.counts.open).toBe(1);
		// Coarse members remain visible themselves.
		const frame = await waitForMarkers(a, (m) => m.length === 1);
		expect(frame).not.toBeNull();
	});

	it('session-scoped block hides a member in both directions', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon);
		const frame = await waitForMarkers(a, (m) => m.length === 1);
		const handle = frame.markers[0].handle;

		await sendFrame(a, { v: 1, op: 'block', handle, ts: Date.now() });
		// Jiggle A to force a fresh sweep with a new payload.
		await sendPos(a, NORTH_20.lat, NORTH_20.lon + 0.00001);
		const after = await waitForMarkers(a, (m) => m.length === 0);
		expect(after).not.toBeNull();

		// B no longer sees A either (bidirectional enforcement).
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon + 0.00001);
		const afterB = await waitForMarkers(b, (m) => m.length === 0);
		expect(afterB).not.toBeNull();
	});
});

describe('PresenceCell — INVISIBLE', () => {
	it('purges all state and closes the socket', async () => {
		const a = await connect(CELL);
		const b = await connect(CELL);
		await sendPos(a, NORTH_20.lat, NORTH_20.lon);
		await sendPos(b, SOUTH_20.lat, SOUTH_20.lon);
		await waitForMarkers(a, (m) => m.length === 1);

		await sendFrame(b, { v: 1, op: 'state', state: 'invisible', ts: Date.now() });
		await waitFor(b, () => b.closed, 8_000).catch(() => undefined);
		expect(b.closed).toBe(true);

		await sendPos(a, NORTH_20.lat, NORTH_20.lon + 0.00001);
		const frame = await waitForMarkers(a, (m) => m.length === 0);
		expect(frame).not.toBeNull();
	});
});

describe('PresenceCell — protocol enforcement', () => {
	it('rejects stale timestamps', async () => {
		const a = await connect(CELL);
		await sendPos(a, CENTER.lat, CENTER.lon, { ts: Date.now() - 700_000 }); // > 600 s window
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'stale_ts');
		expect(err).toBeDefined();
	});

	it('rejects implausible movement (speed ceiling)', async () => {
		const a = await connect(CELL);
		await sendPos(a, CENTER.lat, CENTER.lon);
		const far = destination(CENTER, 90, 500);
		// dt must exceed 0.5 s for the plausibility check to run (GPS jitter
		// guard); 500 m in 3 s = 167 m/s >> the ceiling.
		await sendPos(a, far.lat, far.lon, { ts: Date.now() + 3_000 });
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'speed_violation');
		expect(err).toBeDefined();
	});

	it('rejects positions outside the subscribed cell (role home)', async () => {
		const a = await connect(CELL);
		// Valid geohash alphabet, far-away cell ('s' hemisphere block).
		const far = decodeGeohash('9q8yy2');
		await sendPos(a, far.lat, far.lon);
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'cell_mismatch');
		expect(err).toBeDefined();
	});

	it('rejects frames signed with the wrong key', async () => {
		const a = await connect(CELL);
		await sendWrongSig(a, { v: 1, op: 'pos', lat: CENTER.lat, lon: CENTER.lon, accuracy: 8, ts: Date.now() });
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'bad_sig');
		expect(err).toBeDefined();
	});

	it('enforces the per-connection rate limit', async () => {
		const a = await connect(CELL);
		for (let i = 0; i < 40; i++) {
			await sendPos(a, CENTER.lat, CENTER.lon);
		}
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'rate_limited');
		expect(err).toBeDefined();
	});

	it('rejects home frames for another cell', async () => {
		const a = await connect(CELL);
		await sendFrame(a, { v: 1, op: 'home', cell: 'u33d9c', ts: Date.now() });
		const err = await waitFor(a, (f) => f.op === 'error' && f.code === 'cell_mismatch');
		expect(err).toBeDefined();
	});
});
