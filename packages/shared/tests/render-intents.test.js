import { describe, expect, it } from 'vitest';
import {
	aggregateIntent,
	describeMarker,
	directionSector,
	distanceTier,
	markerIntents,
	speechForAggregate,
	speechForMarker,
} from '../src/render-intents.js';

const GEOMETRY = { distanceBucketM: 10, bearingBucketDeg: 45 };

describe('distanceTier', () => {
	it('buckets meters into tiers', () => {
		expect(distanceTier(5)).toBe('very-close');
		expect(distanceTier(10)).toBe('very-close');
		expect(distanceTier(24)).toBe('close');
		expect(distanceTier(25)).toBe('close');
		expect(distanceTier(49)).toBe('nearby');
		expect(distanceTier(50)).toBe('nearby');
		expect(distanceTier(120)).toBe('far');
	});
});

describe('directionSector', () => {
	it('maps relative degrees to 8 body sectors', () => {
		expect(directionSector(0)).toBe('ahead');
		expect(directionSector(350)).toBe('ahead');
		expect(directionSector(40)).toBe('ahead-right');
		expect(directionSector(80)).toBe('right');
		expect(directionSector(135)).toBe('behind-right');
		expect(directionSector(180)).toBe('behind');
		expect(directionSector(225)).toBe('behind-left');
		expect(directionSector(270)).toBe('left');
		expect(directionSector(315)).toBe('ahead-left');
		expect(directionSector(-45)).toBe('ahead-left'); // wraps negatives
	});
});

describe('describeMarker', () => {
	it('converts buckets to a localized glanceable line', () => {
		// dist bucket 1 → ~15 m; brng bucket 1 → 45° absolute.
		const d = describeMarker(
			{ handle: 'h1', state: 'open', dist: 1, brng: 1 },
			GEOMETRY,
			0, // client facing absolute north → relative 45° = ahead-right
			'en'
		);
		expect(d.meters).toBe(15);
		expect(d.sector).toBe('ahead-right');
		expect(d.line).toBe('Open · 15 m · ahead right');
		expect(d.tier).toBe('close');
	});

	it('returns unknown direction when heading is missing — never invents one', () => {
		const d = describeMarker({ handle: 'h1', state: 'quiet', dist: 3, brng: 2 }, GEOMETRY, null, 'en');
		expect(d.sector).toBe('unknown');
		expect(d.relativeDeg).toBeNull();
		expect(d.line).toContain('direction unknown');
	});

	it('rotates by the client heading', () => {
		// absolute 0° (north), client heading 350° → relative 10° = ahead
		const d = describeMarker({ handle: 'h1', state: 'open', dist: 0, brng: 0 }, GEOMETRY, 350, 'en');
		expect(d.sector).toBe('ahead');
	});

	it('localizes es and fr lines', () => {
		/** @type {import('../src/types.js').MarkerEntry} */
		const m = { handle: 'h1', state: 'open', dist: 1, brng: 1 };
		expect(describeMarker(m, GEOMETRY, 0, 'es').line).toBe('Abierto · 15 m · delante a la derecha');
		expect(describeMarker(m, GEOMETRY, 0, 'fr').line).toBe('Ouvert · 15 m · devant à droite');
		// locale tags with region fall back to the base language
		expect(describeMarker(m, GEOMETRY, 0, 'es-MX').line).toContain('Abierto');
		// unknown locale falls back to en
		expect(describeMarker(m, GEOMETRY, 0, 'zz').line).toContain('Open');
	});
});

describe('markerIntents', () => {
	it('sorts nearest first with urgent priorities and arrow intents', () => {
		const intents = markerIntents(
			[
				{ handle: 'far', state: 'open', dist: 5, brng: 0 },
				{ handle: 'near', state: 'quiet', dist: 0, brng: 2 },
			],
			GEOMETRY,
			0,
			'en'
		);
		const lines = intents.filter((i) => i.kind === 'text_line');
		expect(lines[0]?.text).toContain('Quiet'); // dist 0 → 5 m, nearest
		const arrows = intents.filter((i) => i.kind === 'arrow');
		expect(arrows).toHaveLength(2);
		expect(arrows[0]?.angleDegrees ?? -1).toBeGreaterThanOrEqual(0);
		expect(lines[0]?.priority ?? 0).toBeLessThan(lines[1]?.priority ?? 99);
	});

	it('omits arrows when heading is unknown', () => {
		const intents = markerIntents([{ handle: 'h', state: 'open', dist: 1, brng: 1 }], GEOMETRY, null, 'en');
		expect(intents.filter((i) => i.kind === 'arrow')).toHaveLength(1 - 1);
		expect(intents.filter((i) => i.kind === 'text_line')).toHaveLength(1);
	});
});

describe('aggregate and speech intents', () => {
	it('builds localized ambient summaries', () => {
		expect(aggregateIntent({ open: 2, quiet: 1 }, 'en').text).toBe('Nearby: 2 people open, 1 person quiet');
		expect(aggregateIntent({ open: 1, quiet: 0 }, 'es').text).toBe('Cerca: 1 persona abierta, 0 personas tranquilas');
		expect(aggregateIntent({ open: 1, quiet: 1 }, 'fr').text).toContain('1 personne ouverte');
	});

	it('speech intents carry the same bucketed content', () => {
		const d = describeMarker({ handle: 'h', state: 'open', dist: 2, brng: 4 }, GEOMETRY, 0, 'en');
		expect(speechForMarker(d, 'en').kind).toBe('speech');
		expect(speechForAggregate({ open: 1, quiet: 1 }, 'en').text).toContain('Nearby');
	});
});
