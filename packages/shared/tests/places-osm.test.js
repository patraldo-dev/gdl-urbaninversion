import { describe, expect, it } from 'vitest';
import { buildOverpassQuery, normalizeOverpassVenues } from '../src/places-osm.js';

describe('buildOverpassQuery', () => {
	it('embeds the rounded center and bounded amenity sets', () => {
		const q = buildOverpassQuery(19.3467321, -99.1617489);
		expect(q).toContain('around:200,19.346732,-99.161749');
		expect(q).toContain('amenity~"^(cafe|restaurant|fast_food|bar|pub|food_court|library|fitness_centre)$"');
		expect(q).toContain('leisure~"^(fitness_centre|sports_centre)$"');
		expect(q).toContain('[name]'); // unnamed POIs never match
	});
});

describe('normalizeOverpassVenues', () => {
	const FIXTURE = {
		elements: [
			{ type: 'node', id: 1, lat: 19.3470, lon: -99.1620, tags: { name: 'Café Aurora', amenity: 'cafe' } },
			{ type: 'way', id: 2, center: { lat: 19.3475, lon: -99.1615 }, tags: { name: 'Gimnasio Fit 21', leisure: 'fitness_centre' } },
			{ type: 'node', id: 3, lat: 19.3469, lon: -99.1621, tags: { name: 'Café Aurora', amenity: 'cafe' } }, // dup-ish (within ~20m of #1? 0.0001° ≈ 11m → same key)
			{ type: 'node', id: 4, lat: 19.3480, lon: -99.1600, tags: { amenity: 'cafe' } }, // unnamed → dropped
			{ type: 'node', id: 5, lat: 19.3472, lon: -99.1619, tags: { name: 'Biblioteca Coyoacán', amenity: 'library' } },
		],
	};

	it('normalizes, dedupes, distance-sorts and drops unnamed', () => {
		const venues = normalizeOverpassVenues(FIXTURE, 19.3467, -99.1617);
		const names = venues.map((v) => v.name);
		expect(names).toEqual(['Café Aurora', 'Biblioteca Coyoacán', 'Gimnasio Fit 21']);
		expect(venues[0].kind).toBe('cafe');
		expect(venues[2].kind).toBe('fitness_centre');
		// Way coordinates come from center.
		expect(venues[2].lat).toBeCloseTo(19.3475, 5);
	});

	it('caps the list and tolerates garbage', () => {
		const many = { elements: Array.from({ length: 40 }, (_, i) => ({ type: 'node', id: i, lat: 19.34, lon: -99.16, tags: { name: `V${i}`, amenity: 'cafe' } })) };
		expect(normalizeOverpassVenues(many, 19.34, -99.16, 15)).toHaveLength(15);
		expect(normalizeOverpassVenues(null, 0, 0)).toEqual([]);
		expect(normalizeOverpassVenues({ elements: 'nope' }, 0, 0)).toEqual([]);
	});
});
