import { describe, expect, it } from 'vitest';
import { generateSessionKeyPair, bytesToB64Url } from '../src/index.js';
import { parseClientFrame } from '../src/validation.js';
import { defaultConfig } from '../src/config.js';
import {
	isPlaceCell,
	isValidPlaceSlug,
	isValidRoomName,
	placeSlugFromCell,
	slugifyPlaceName,
} from '../src/places.js';

const cfg = defaultConfig;
const SIG = bytesToB64Url(crypto.getRandomValues(new Uint8Array(64)));

async function helloWithCell(cell) {
	const pair = await generateSessionKeyPair();
	return {
		v: 1,
		op: 'hello',
		did: pair.did,
		state: 'open',
		cell,
		role: 'home',
		turnstile: 'XXXX.DUMMY.TOKEN.XXXX',
		cfg: { v: 1, geohashPrecision: cfg.GEOHASH_PRECISION },
		ts: Date.now(),
		sig: SIG,
	};
}

describe('place slugs and cells', () => {
	it('accepts good slugs, rejects bad ones', () => {
		for (const good of ['cafe-aurora', 'gym-fit-21', 'a-b', 'x9y', 'p'.repeat(40)]) {
			expect(isValidPlaceSlug(good)).toBe(true);
		}
		for (const bad of ['', 'ab', 'x9', '-lead', 'trail-', 'Has Space', 'áccents', 'a'.repeat(41), 'under_score', 'p'.repeat(41)]) {
			expect(isValidPlaceSlug(bad)).toBe(false);
		}
	});

	it('identifies place cells and extracts slugs', () => {
		expect(isPlaceCell('place:cafe-aurora')).toBe(true);
		expect(isPlaceCell('u33dc0')).toBe(false);
		expect(isPlaceCell('place:BAD')).toBe(false);
		expect(placeSlugFromCell('place:cafe-aurora')).toBe('cafe-aurora');
		expect(placeSlugFromCell('u33dc0')).toBe('');
	});

	it('room names accept geohash OR place', () => {
		expect(isValidRoomName('u33dc0', cfg.GEOHASH_PRECISION)).toBe(true);
		expect(isValidRoomName('place:cafe-aurora', cfg.GEOHASH_PRECISION)).toBe(true);
		expect(isValidRoomName('nope', cfg.GEOHASH_PRECISION)).toBe(false);
	});

	it('slugifies display names (accents stripped)', () => {
		expect(slugifyPlaceName('Café Aurora')).toBe('cafe-aurora');
		expect(slugifyPlaceName('  Gym  Fit–21!! ')).toBe('gym-fit-21');
		expect(slugifyPlaceName('***')).toBe('');
	});
});

describe('parseClientFrame — hello with place cell', () => {
	it('accepts a place room', async () => {
		const r = parseClientFrame(JSON.stringify(await helloWithCell('place:cafe-aurora')), cfg);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.frame.cell).toBe('place:cafe-aurora');
	});

	it('still rejects garbage cells', async () => {
		for (const cell of ['place:BAD SLUG', 'place:', 'place:x', 'zzzz']) {
			const r = parseClientFrame(JSON.stringify(await helloWithCell(cell)), cfg);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.code).toBe('bad_cell');
		}
	});
});
