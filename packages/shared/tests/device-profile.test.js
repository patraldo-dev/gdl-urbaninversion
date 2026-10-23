import { describe, expect, it } from 'vitest';
import {
	DEVICE_DISPLAYS,
	HEADING_SOURCES,
	LOCATION_SOURCES,
	normalizeDeviceProfile,
	randomClientId,
} from '../src/device-profile.js';

const GOOD = {
	clientId: 'c-abc123',
	display: 'hud2d',
	audio: true,
	headingSource: 'compass',
	locationSource: 'paired-phone',
	locale: 'es-MX',
};

describe('normalizeDeviceProfile', () => {
	it('accepts a valid profile', () => {
		const r = normalizeDeviceProfile(GOOD);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.profile.locale).toBe('es-MX');
	});

	it('rejects missing and non-object input', () => {
		expect(normalizeDeviceProfile(undefined).ok).toBe(false);
		expect(normalizeDeviceProfile(null).ok).toBe(false);
		expect(normalizeDeviceProfile('phone').ok).toBe(false);
		expect(normalizeDeviceProfile([GOOD]).ok).toBe(false);
	});

	it('rejects bad clientIds', () => {
		for (const clientId of ['', 'x'.repeat(65), 'has space', 'üñî']) {
			expect(normalizeDeviceProfile({ ...GOOD, clientId }).ok).toBe(false);
		}
	});

	it('rejects unknown enum values', () => {
		expect(normalizeDeviceProfile({ ...GOOD, display: 'hologram' }).ok).toBe(false);
		expect(normalizeDeviceProfile({ ...GOOD, headingSource: 'gps' }).ok).toBe(false);
		expect(normalizeDeviceProfile({ ...GOOD, locationSource: 'telepathy' }).ok).toBe(false);
		expect(normalizeDeviceProfile({ ...GOOD, audio: 'yes' }).ok).toBe(false);
	});

	it('rejects bad locales', () => {
		expect(normalizeDeviceProfile({ ...GOOD, locale: '' }).ok).toBe(false);
		expect(normalizeDeviceProfile({ ...GOOD, locale: 'e'.repeat(20) }).ok).toBe(false);
		expect(normalizeDeviceProfile({ ...GOOD, locale: 'es' }).ok).toBe(true);
		expect(normalizeDeviceProfile({ ...GOOD, locale: 'fr-CA' }).ok).toBe(true);
	});

	it('enum constants stay stable wire vocabulary', () => {
		expect([...DEVICE_DISPLAYS]).toEqual(['none', 'text', 'hud2d', 'spatial']);
		expect([...HEADING_SOURCES]).toEqual(['none', 'compass', 'gps-course', 'manual']);
		expect([...LOCATION_SOURCES]).toEqual(['none', 'gps', 'manual', 'paired-phone']);
	});
});

describe('randomClientId', () => {
	it('produces unique, pattern-valid ids', () => {
		const a = randomClientId();
		const b = randomClientId();
		expect(a).not.toEqual(b);
		expect(normalizeDeviceProfile({ ...GOOD, clientId: a }).ok).toBe(true);
		expect(normalizeDeviceProfile({ ...GOOD, clientId: b }).ok).toBe(true);
	});
});
