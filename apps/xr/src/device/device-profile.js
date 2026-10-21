/**
 * DeviceProfile: every device-specific decision lives behind one of these
 * (input model, session mode, display constraints, location/heading
 * providers). packages/shared and workers/presence contain no device
 * assumptions; adding XREAL or other WebXR glasses later means adding one
 * file in ./profiles and one case in resolveDeviceProfile.
 *
 * @typedef {object} DeviceProfile
 * @property {string} id Stable identifier (also the `?device=` query value).
 * @property {'xr-ar' | 'browser3d'} sessionMode Preferred render path. 'xr-ar' = WebXR immersive-ar
 *   (IWER emulation, Quest 3 comparison); 'browser3d' = the plain web render path, which is the
 *   Ray-Ban Display web-app runtime's normal mode (no WebXR documented there — see profile docs).
 * @property {'gaze-pinch' | 'band-captouch' | 'mouse-keyboard'} inputModel
 * @property {boolean} narrowMonocularDisplay True for HUD-first, glanceable layout (600×600 right-lens class).
 * @property {() => import('./providers/location-provider.js').LocationProvider} createLocationProvider
 * @property {() => import('./providers/heading-provider.js').HeadingProvider} createHeadingProvider
 */

import { rayBanDisplayProfile } from './profiles/ray-ban-display.js';
import { simulatedProfile } from './profiles/simulated.js';

/** @type {Map<string, DeviceProfile>} */
const PROFILES = new Map([
	[rayBanDisplayProfile.id, rayBanDisplayProfile],
	[simulatedProfile.id, simulatedProfile],
]);

/**
 * @param {string | null} [id] Explicit profile id (e.g. from `?device=`); defaults to Ray-Ban Display.
 * @returns {DeviceProfile}
 */
export function resolveDeviceProfile(id) {
	return PROFILES.get(id ?? 'ray-ban-display') ?? rayBanDisplayProfile;
}

/** @returns {string} The profile id requested via URL query, if any. */
export function deviceProfileIdFromUrl() {
	const params = new URLSearchParams(globalThis.location?.search ?? '');
	return params.get('device');
}
