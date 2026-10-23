/**
 * Screen Wake Lock guard: the phone hub is a FOREGROUND presence client —
 * a locked screen freezes the page (timers, geolocation, sockets) on both
 * Chrome Android and iOS Safari. While presence is active and the page is
 * visible we hold a screen wake lock so "keep this screen on to remain
 * discoverable" is enforced by the platform where supported.
 *
 * Usage: call acquire() whenever presence turns active and on
 * visibilitychange→visible; release() when INVISIBLE.
 */

/** @type {{ sentinel: any | null }} */
const state = { sentinel: null };

/**
 * @returns {Promise<boolean>} true when a wake lock is held.
 */
export async function acquireWakeLock() {
	try {
		const wl = /** @type {any} */ (globalThis.navigator)?.wakeLock;
		if (!wl?.request) return false;
		if (document.visibilityState !== 'visible') return false;
		if (state.sentinel && !state.sentinel.released) return true;
		state.sentinel = await wl.request('screen');
		state.sentinel.addEventListener?.('release', () => {
			state.sentinel = null;
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * @returns {Promise<void>}
 */
export async function releaseWakeLock() {
	try {
		await state.sentinel?.release();
	} catch {
		// Already released.
	}
	state.sentinel = null;
}

/** @returns {boolean} */
export function hasWakeLock() {
	return state.sentinel != null && !state.sentinel.released;
}

/** @returns {boolean} */
export function wakeLockSupported() {
	return typeof globalThis.navigator !== 'undefined' && 'wakeLock' in globalThis.navigator;
}
