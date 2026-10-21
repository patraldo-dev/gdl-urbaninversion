/**
 * SimulatedProfile — laptop development with IWER and the Phase 2f
 * simulation harness. Uses the XR-ar path (IWER emulates a device with
 * tracked camera controls) and a scripted walker for location, so
 * `npm run dev` works with no sensors at all.
 */

import { SimulatedLocationProvider } from '../providers/location-provider.js';
import { WalkToCalibrateHeadingProvider } from '../providers/heading-provider.js';

/** @type {import('../device-profile.js').DeviceProfile} */
export const simulatedProfile = {
	id: 'simulated',
	sessionMode: 'xr-ar',
	inputModel: 'mouse-keyboard',
	narrowMonocularDisplay: true, // exercise the HUD-first layout in dev too
	createLocationProvider: () => new SimulatedLocationProvider(),
	createHeadingProvider: () => new WalkToCalibrateHeadingProvider(),
};
