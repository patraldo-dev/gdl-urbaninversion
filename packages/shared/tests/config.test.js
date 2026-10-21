import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig, configFromEnvVars, isGeoSanityEnabled } from '../src/config.js';

describe('resolveConfig', () => {
	it('accepts defaults', () => {
		const cfg = resolveConfig();
		expect(cfg.GEOHASH_PRECISION).toBe(6);
		expect(cfg.QUIET_VISIBILITY).toBe('everyone');
		expect(cfg.EDGE_MARGIN_M).toBeGreaterThanOrEqual(cfg.PROXIMITY_RADIUS_M);
		expect(cfg.D1_GEOHASH_LEN).toBeLessThan(cfg.GEOHASH_PRECISION);
	});

	it('applies overrides and validates relationships', () => {
		expect(resolveConfig({ PROXIMITY_RADIUS_M: 80 }).PROXIMITY_RADIUS_M).toBe(80);
		expect(() => resolveConfig({ BEARING_BUCKET_DEG: 50 })).toThrow(); // must divide 360
		expect(() => resolveConfig({ D1_GEOHASH_LEN: 6 })).toThrow(); // must be shorter than precision
		expect(() => resolveConfig({ QUIET_VISIBILITY: /** @type {any} */ ('sometimes') })).toThrow();
		expect(() => resolveConfig({ EDGE_MARGIN_M: 10 })).toThrow(); // < PROXIMITY_RADIUS_M
	});
});

describe('configFromEnvVars', () => {
	it('coerces strings from wrangler vars', () => {
		const overrides = configFromEnvVars({ GEOHASH_PRECISION: '5', K_ANON: '10', QUIET_VISIBILITY: 'quiet_only', JUNK: 'x' });
		expect(overrides.GEOHASH_PRECISION).toBe(5);
		expect(overrides.K_ANON).toBe(10);
		expect(overrides.QUIET_VISIBILITY).toBe('quiet_only');
		expect('JUNK' in overrides).toBe(false);
		expect(() => resolveConfig(overrides)).not.toThrow();
	});

	it('geo sanity is off by default and enableable', () => {
		expect(isGeoSanityEnabled(defaultConfig)).toBe(false);
		expect(isGeoSanityEnabled(resolveConfig({ GEO_SANITY_MAX_KM: 150 }))).toBe(true);
	});
});
