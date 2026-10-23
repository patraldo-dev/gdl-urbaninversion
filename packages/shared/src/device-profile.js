/**
 * DeviceProfile: the capability block a client declares in its `hello`.
 * The server never branches on it (workers/presence stays device-agnostic);
 * it exists so shared render-intent code and telemetry-free policy rules can
 * reason about what a client can show.
 *
 * Privacy: clientId is a per-session random value (randomClientId()), NOT a
 * persistent identifier — the session's rotating did:key already prevents
 * cross-session linkage, and the profile must not undo that.
 */

/** @typedef {'none' | 'text' | 'hud2d' | 'spatial'} DeviceDisplay */

/** @typedef {'none' | 'compass' | 'gps-course' | 'manual'} HeadingSource */

/** @typedef {'none' | 'gps' | 'manual' | 'paired-phone'} LocationSource */

/**
 * @typedef {object} DeviceProfile
 * @property {string} clientId Per-session random id (no persistence).
 * @property {DeviceDisplay} display
 * @property {boolean} audio
 * @property {HeadingSource} headingSource
 * @property {LocationSource} locationSource
 * @property {string} locale BCP-47-ish tag, ≤ 16 chars (e.g. 'es', 'fr-CA').
 */

/** @type {readonly DeviceDisplay[]} */
export const DEVICE_DISPLAYS = ['none', 'text', 'hud2d', 'spatial'];

/** @type {readonly HeadingSource[]} */
export const HEADING_SOURCES = ['none', 'compass', 'gps-course', 'manual'];

/** @type {readonly LocationSource[]} */
export const LOCATION_SOURCES = ['none', 'gps', 'manual', 'paired-phone'];

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LOCALE_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * @returns {string} A per-session client id (crypto randomness when
 * available). Not stored anywhere; regenerate per session.
 */
export function randomClientId() {
	const c = globalThis.crypto;
	if (c?.randomUUID) return c.randomUUID();
	// Fallback for odd runtimes; still session-scoped.
	return `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Validate/normalize a raw `dev` block from a hello frame.
 * @param {unknown} raw
 * @returns {{ ok: true, profile: DeviceProfile } | { ok: false, error: string }}
 */
export function normalizeDeviceProfile(raw) {
	if (raw == null) return { ok: false, error: 'dev: missing' };
	if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'dev: expected object' };
	const d = /** @type {Record<string, unknown>} */ (raw);
	const clientId = d['clientId'];
	if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
		return { ok: false, error: 'dev.clientId: expected 1-64 [A-Za-z0-9_-] chars' };
	}
	const display = d['display'];
	if (typeof display !== 'string' || !/** @type {readonly string[]} */ (DEVICE_DISPLAYS).includes(display)) {
		return { ok: false, error: `dev.display: expected one of ${DEVICE_DISPLAYS.join('|')}` };
	}
	const audio = d['audio'];
	if (typeof audio !== 'boolean') return { ok: false, error: 'dev.audio: expected boolean' };
	const headingSource = d['headingSource'];
	if (typeof headingSource !== 'string' || !/** @type {readonly string[]} */ (HEADING_SOURCES).includes(headingSource)) {
		return { ok: false, error: `dev.headingSource: expected one of ${HEADING_SOURCES.join('|')}` };
	}
	const locationSource = d['locationSource'];
	if (typeof locationSource !== 'string' || !/** @type {readonly string[]} */ (LOCATION_SOURCES).includes(locationSource)) {
		return { ok: false, error: `dev.locationSource: expected one of ${LOCATION_SOURCES.join('|')}` };
	}
	const locale = d['locale'];
	if (typeof locale !== 'string' || locale.length === 0 || locale.length > 16 || !LOCALE_RE.test(locale)) {
		return { ok: false, error: 'dev.locale: expected short BCP-47-like tag' };
	}
	return {
		ok: true,
		profile: {
			clientId,
			display: /** @type {DeviceDisplay} */ (display),
			audio,
			headingSource: /** @type {HeadingSource} */ (headingSource),
			locationSource: /** @type {LocationSource} */ (locationSource),
			locale,
		},
	};
}
