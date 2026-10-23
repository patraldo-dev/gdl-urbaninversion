/**
 * Device profiles for flat (non-XR) clients: which providers to use and
 * the default wire DeviceProfile each client type declares. apps/xr keeps
 * its own frozen copies; this package serves the phone hub and HUD
 * glasses adapters.
 */

import { BrowserGeolocationProvider, SimulatedLocationProvider } from './providers.js';
import { CompassHeadingProvider } from './heading.js';

/**
 * @typedef {object} ResolvedProfile
 * @property {string} id
 * @property {() => import('./providers.js').LocationProvider} createLocationProvider
 * @property {() => import('./heading.js').CompassHeadingProvider | NoopHeadingProvider} createHeadingProvider
 * @property {boolean} useBrowserGeolocation For resume()'s one-shot fix nudge.
 * @property {Partial<import('@urbaninversion/shared').DeviceProfile>} defaultDev
 */

/**
 * Heading provider for profiles that have no compass concept (e.g. the
 * simulator scripts its own heading through the location fix's course).
 */
export class NoopHeadingProvider {
	constructor() {
		this.id = 'noop';
	}
	/**
	 * @param {((heading: number | null, source: 'no-data' | 'permission' | 'reading' | 'gps-course') => void) | null} [onChange]
	 */
	start(onChange) {
		onChange?.(null, 'no-data');
	}
	stop() {}
	/** @param {{ heading?: number, speed?: number }} _fix */
	updateFromFix(_fix) {}
}

/**
 * The scripted simulator: GPS-course-style fixes with heading included.
 * Used by tests and `?device=simulated` on the hub.
 * @returns {ResolvedProfile}
 */
function simulatedProfile() {
	return {
		id: 'simulated',
		createLocationProvider: () => new SimulatedLocationProvider(),
		createHeadingProvider: () => new NoopHeadingProvider(),
		useBrowserGeolocation: false,
		defaultDev: {
			display: 'text',
			audio: false,
			headingSource: 'gps-course',
			locationSource: 'manual',
		},
	};
}

/** The phone hub. @returns {ResolvedProfile} */
function phoneProfile() {
	return {
		id: 'phone',
		createLocationProvider: () => new BrowserGeolocationProvider(),
		createHeadingProvider: () => new CompassHeadingProvider(),
		useBrowserGeolocation: true,
		defaultDev: {
			display: 'text',
			audio: true,
			headingSource: 'compass',
			locationSource: 'gps',
		},
	};
}

/** Meta Ray-Ban Display HUD adapter. @returns {ResolvedProfile} */
function hudProfile() {
	return {
		id: 'hud2d',
		createLocationProvider: () => new BrowserGeolocationProvider(),
		createHeadingProvider: () => new CompassHeadingProvider(),
		useBrowserGeolocation: true,
		defaultDev: {
			display: 'hud2d',
			audio: true,
			headingSource: 'compass',
			locationSource: 'paired-phone',
		},
	};
}

/** @type {Map<string, () => ResolvedProfile>} */
const PROFILES = new Map([
	['phone', phoneProfile],
	['hud2d', hudProfile],
	['simulated', simulatedProfile],
]);

/**
 * @param {string | null} [id] Explicit profile id; the phone hub uses the
 * default, the glasses adapter passes 'hud2d', tests use 'simulated'.
 * @returns {ResolvedProfile}
 */
export function resolveProfile(id) {
	const factory = id != null ? PROFILES.get(id) : undefined;
	return (factory ?? phoneProfile)();
}

/** @returns {string | null} The `?device=` query value, if any. */
export function profileIdFromUrl() {
	const params = new URLSearchParams(globalThis.location?.search ?? '');
	return params.get('device');
}
