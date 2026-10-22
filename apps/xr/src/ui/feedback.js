/**
 * Click feedback for UIKitML buttons: a short haptic pulse so every wired
 * button answers immediately, even when the visible effect takes a moment
 * (or is a page navigation).
 *
 * XR: pulses both controllers' actuators — the clicking hand is not known
 * here, and hands-only sessions have no actuators, so everything is
 * guarded. 2D fallback: the Vibration API on supporting phones (a no-op
 * on iOS Safari and desktops).
 */

/**
 * @param {import('@iwsdk/core').World} world
 * @param {number} [intensity] 0–1
 * @param {number} [durationMs]
 * @returns {void}
 */
export function hapticPulse(world, intensity = 0.7, durationMs = 70) {
	const gamepads = world?.input?.xr?.gamepads;
	for (const hand of ['left', 'right']) {
		const actuator = gamepads?.[hand]?.gamepad?.hapticActuators?.[0];
		try {
			actuator?.pulse?.(intensity, durationMs);
		} catch {
			// Older GamepadHapticActuator implementations may throw on pulse().
		}
	}
	try {
		globalThis.navigator?.vibrate?.(12);
	} catch {
		// Vibration availability/permission varies; ignore.
	}
}
