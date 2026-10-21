import { describe, expect, it } from 'vitest';
import { canonicalize } from '../src/canonical.js';

describe('canonicalize', () => {
	it('sorts keys recursively and drops whitespace', () => {
		expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
	});

	it('drops undefined fields', () => {
		expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
	});

	it('preserves array order', () => {
		expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
	});

	it('accepts null, strings, booleans', () => {
		expect(canonicalize({ a: null, b: 'x', c: true })).toBe('{"a":null,"b":"x","c":true}');
	});

	it('throws on non-finite numbers', () => {
		expect(() => canonicalize({ a: Number.POSITIVE_INFINITY })).toThrow();
		expect(() => canonicalize({ a: Number.NaN })).toThrow();
	});

	it('is stable across key insertion orders (JCS subset property)', () => {
		const a = { v: 1, op: 'pos', lat: 52.5, lon: 13.4, ts: 123 };
		const b = { ts: 123, lon: 13.4, lat: 52.5, op: 'pos', v: 1 };
		expect(canonicalize(a)).toBe(canonicalize(b));
	});
});
