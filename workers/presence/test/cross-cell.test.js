import { reset } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeGeohash, destination, geohashBBox, geohashNeighbors } from '@urbaninversion/shared';
import { connect, sendFrame, sendPos, waitForMarkers } from './helpers.js';
import { Walker } from './sim/walkers.js';

/**
 * Acceptance criterion: two walkers approaching each other see correct
 * bucketed relative vectors across a cell boundary, with a clean handoff of
 * emission duty between the two Durable Objects.
 */

const WEST_CELL = 'u33d8v';
const EAST_CELL = geohashNeighbors(WEST_CELL).e;

/** A point exactly on the shared boundary at the cells' common latitude. */
function boundaryPoint() {
	const west = geohashBBox(WEST_CELL);
	return { lat: (west.minLat + west.maxLat) / 2, lon: west.maxLon };
}

afterEach(async () => {
	await reset();
});

describe('cross-cell presence', () => {
	it('straddling pair see each other via each subject\u2019s home DO', async () => {
		const bp = boundaryPoint();
		// 20 m from the boundary each side: ~40 m apart, comfortably inside
		// the 60 m proximity radius even with seeded GPS noise (σ5 m).
		const aPos = destination(bp, 270, 20);
		const bPos = destination(bp, 90, 20);

		// A: home west + edge east. B: home east + edge west.
		const aHome = await connect(WEST_CELL);
		const aEdge = await connect(EAST_CELL, { role: 'edge' });
		const bHome = await connect(EAST_CELL);
		const bEdge = await connect(WEST_CELL, { role: 'edge' });

		for (const c of [aHome, aEdge]) await sendPos(c, aPos.lat, aPos.lon);
		for (const c of [bHome, bEdge]) await sendPos(c, bPos.lat, bPos.lon);

		// B sees A — emitted by A's home DO (west) onto B's edge socket.
		const bSeesA = await waitForMarkers(bEdge, (m) => m.length === 1);
		expect(bSeesA).not.toBeNull();
		// A sees B — emitted by B's home DO (east) onto A's edge socket.
		const aSeesB = await waitForMarkers(aEdge, (m) => m.length === 1);
		expect(aSeesB).not.toBeNull();
		expect(aSeesB.markers[0].state).toBe('open');
		// Distance across the boundary is ~40 m: bucket 3-4, never > 5.
		expect(aSeesB.markers[0].dist).toBeLessThanOrEqual(5);
	});

	it('walker crossing the boundary keeps a continuous marker (handoff)', async () => {
		const bp = boundaryPoint();
		// Walker starts 40 m west and crosses; B stands 10 m east. Every
		// step keeps them within 50 m — inside the 60 m radius throughout.
		const walker = new Walker(destination(bp, 270, 40), { bearingDeg: 90, speedMps: 10, seed: 7 });
		const bPos = destination(bp, 90, 10);

		const bHome = await connect(EAST_CELL);
		const bEdge = await connect(WEST_CELL, { role: 'edge' });

		// B announces itself everywhere it subscribes.
		await sendPos(bHome, bPos.lat, bPos.lon);
		await sendPos(bEdge, bPos.lat, bPos.lon);

		// Walker starts west of the boundary: home west, edge east.
		let homeSock = await connect(WEST_CELL);
		let edgeSock = await connect(EAST_CELL, { role: 'edge' });

		const fix0 = walker.step(0);
		await sendPos(homeSock, fix0.lat, fix0.lon, { heading: fix0.heading, speed: fix0.speed });
		await sendPos(edgeSock, fix0.lat, fix0.lon, { heading: fix0.heading, speed: fix0.speed });

		const first = await waitForMarkers(bEdge, (m) => m.length === 1);
		expect(first).not.toBeNull();
		const handle = first.markers[0].handle;

		// Walk 9 steps of 10 m east: crosses the boundary mid-way.
		let crossed = false;
		for (let i = 1; i <= 9; i++) {
			const fix = walker.step(1);
			const inEast = fix.lon > bp.lon;
			if (inEast && !crossed) {
				// Handoff — the client library's exact sequence, replayed:
				// 1) promote the east socket with a home frame,
				// 2) close the old home socket,
				// 3) re-subscribe the old cell as edge (still within margin).
				await sendFrame(edgeSock, { v: 1, op: 'home', cell: EAST_CELL, ts: Date.now() });
				homeSock.ws.close(1000, 'home cell changed');
				const newHome = edgeSock;
				const newEdge = await connect(WEST_CELL, { role: 'edge' });
				homeSock = newHome;
				edgeSock = newEdge;
				crossed = true;
			}
			await sendPos(homeSock, fix.lat, fix.lon, { heading: fix.heading, speed: fix.speed });
			await sendPos(edgeSock, fix.lat, fix.lon, { heading: fix.heading, speed: fix.speed });

			// B keeps seeing the SAME handle, before and after the crossing,
			// through whichever DO currently owns emission duty. Once the
			// walker is east, the marker arrives on B's HOME socket.
			const viaEdge = await waitForMarkers(bEdge, (m) => m.some((x) => x.handle === handle), 2_000);
			const viaHome = viaEdge
				? null
				: await waitForMarkers(bHome, (m) => m.some((x) => x.handle === handle));
			expect(viaEdge ?? viaHome).not.toBeNull();
		}
		expect(crossed).toBe(true);
		// After the crossing, B's view is fed by the east DO as home.
		const finalHome = await waitForMarkers(bHome, (m) => m.some((x) => x.handle === handle));
		expect(finalHome).not.toBeNull();
	});
});
