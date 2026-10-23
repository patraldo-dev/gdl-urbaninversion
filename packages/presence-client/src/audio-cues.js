/**
 * Audio cues: opt-in spoken presence lines for phones with any Bluetooth
 * headset / audio glasses (speech is a first-class output, not a
 * fallback). Built on speechSynthesis with:
 *  - explicit opt-in (persisted), never auto-enabled (autoplay policy)
 *  - rate limiting: one cue per MIN_INTERVAL_MS, newest-wins queue of 1
 *  - quiet toggle = instant mute
 */

const OPT_IN_KEY = 'urbaninversion.audioCues';
const MIN_INTERVAL_MS = 8_000;

/** @type {ReturnType<typeof setTimeout> | null} */
let cooldownTimer = null;
let queuedText = '';
let currentLocale = 'en';

/**
 * @returns {boolean}
 */
export function audioCuesEnabled() {
	try {
		return globalThis.localStorage?.getItem(OPT_IN_KEY) === 'true';
	} catch {
		return false;
	}
}

/**
 * @param {boolean} value
 */
export function setAudioCuesEnabled(value) {
	try {
		globalThis.localStorage?.setItem(OPT_IN_KEY, String(value));
	} catch {
		// Storage can be unavailable; the toggle just won't persist.
	}
	if (!value) queuedText = '';
}

/** @param {string} locale */
export function setAudioCuesLocale(locale) {
	currentLocale = locale;
}

/**
 * @returns {boolean} true when speechSynthesis exists (call after a user
 * gesture so feature detection happens in a gesture-adjacent context).
 */
export function speechSupported() {
	return typeof globalThis.speechSynthesis !== 'undefined';
}

/**
 * Request a spoken cue. Rate-limited: during cooldown the newest request
 * replaces any older queued one (at most one cue plays after cooldown).
 * @param {string} text
 */
export function speakCue(text) {
	if (!audioCuesEnabled() || !text || !speechSupported()) return;
	if (cooldownTimer != null) {
		queuedText = text; // newest wins; at most one queued cue
		return;
	}
	utter(text);
	cooldownTimer = setTimeout(() => {
		cooldownTimer = null;
		if (queuedText) {
			const next = queuedText;
			queuedText = '';
			utter(next);
			cooldownTimer = setTimeout(() => {
				cooldownTimer = null;
			}, MIN_INTERVAL_MS);
		}
	}, MIN_INTERVAL_MS);
}

/**
 * @param {string} text
 */
function utter(text) {
	try {
		const u = new SpeechSynthesisUtterance(text);
		u.lang = currentLocale;
		u.rate = 1;
		globalThis.speechSynthesis.cancel();
		globalThis.speechSynthesis.speak(u);
	} catch {
		// Speech can throw pre-gesture; the opt-in toggle is gesture-driven.
	}
}

/** Test seam: reset the rate limiter. */
export function resetAudioCuesForTest() {
	if (cooldownTimer != null) clearTimeout(cooldownTimer);
	cooldownTimer = null;
	queuedText = '';
}
