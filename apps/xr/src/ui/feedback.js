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
	audioBlip();
}

/**
 * Short confirmation tick for every button press. Hands have no haptic
 * actuators, so audio is the primary feedback on hands-first devices
 * (the competition requires full hands usability — controllers optional).
 * Lazily creates the AudioContext inside the user-gesture chain.
 * @returns {void}
 */
export function audioBlip() {
	try {
		const Ctx = /** @type {typeof AudioContext} */ (
			globalThis.AudioContext ?? globalThis.webkitAudioContext
		);
		if (!Ctx) return;
		if (!blipCtx || blipCtx.state === 'closed') blipCtx = new Ctx();
		if (blipCtx.state === 'suspended') void blipCtx.resume();
		const t = blipCtx.currentTime;
		const osc = blipCtx.createOscillator();
		const gain = blipCtx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(1400, t);
		osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
		osc.connect(gain).connect(blipCtx.destination);
		osc.start(t);
		osc.stop(t + 0.06);
	} catch {
		// Audio can be blocked before a user gesture; the visual pressed
		// state still confirms the click.
	}
}

/** @type {AudioContext | null} */
let blipCtx = null;
