/**
 * RayBanDisplayProfile — the target device (Meta's already-shipping display
 * glasses; developer preview live since May 2026).
 *
 * Platform facts this adapter encodes (verified against Meta's docs, Oct
 * 2026): web apps run directly on the glasses as plain HTML/CSS/JS with
 * display and inputs optimized for the device; no WebXR/immersive sessions
 * are documented for that runtime, so the app's normal path here is the
 * IWSDK browser-3D render mode (World renders into the DOM container; the
 * WebXR ar path in iwsdk.config.json serves the IWER/Quest 3 comparison
 * flows). Input: Neural Band + captouch navigation/selection, which the
 * runtime maps to pointer/click — the same element event path the UIKitML
 * panels already use. Location: no GPS chip; the OS pairs with a phone and
 * sources location from it, exposed to web apps as geolocation
 * // VERIFY: accuracy on device. Monocular 600×600 right-lens display:
 * HUD-first layout, edge indicators, glanceable targets.
 */

import { BrowserGeolocationProvider } from '../providers/location-provider.js';
import { WalkToCalibrateHeadingProvider } from '../providers/heading-provider.js';

/** @type {import('../device-profile.js').DeviceProfile} */
export const rayBanDisplayProfile = {
	id: 'ray-ban-display',
	sessionMode: 'browser3d',
	inputModel: 'band-captouch',
	narrowMonocularDisplay: true,
	createLocationProvider: () => new BrowserGeolocationProvider(),
	createHeadingProvider: () => new WalkToCalibrateHeadingProvider(),
};
