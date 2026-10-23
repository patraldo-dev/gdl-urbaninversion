/**
 * CompassHeadingProvider: absolute compass heading for flat (non-XR)
 * clients — phones and HUD glasses.
 *
 * Priority order:
 *  1. `deviceorientationabsolute` (Chrome Android): use alpha as absolute
 *     bearing from north (webkitCompassHeading semantics handled too).
 *  2. `deviceorientation` (iOS Safari): webkitCompassHeading when present;
 *     requires DeviceOrientationEvent.requestPermission() from a user
 *     gesture — call requestPermissionIfNeeded() inside a click handler.
 *  3. GPS course over ground while moving (fix.speed > ~1 m/s), fed via
 *     updateFromFix() — walking-dead-reckoning without a compass.
 * Without any source the heading is null and render-intents report
 * 'unknown' directions — a direction is never invented.
 *
 * @typedef {'no-data' | 'permission' | 'reading' | 'gps-course'} HeadingSource
 */

const GPS_COURSE_MIN_SPEED_MPS = 1.0;
const COMPASS_STALE_MS = 3_000;

export class CompassHeadingProvider {
	constructor() {
		this.id = 'absolute-orientation';
		/** @type {number | null} */
		this.headingDeg = null;
		/** @type {HeadingSource} */
		this.source = 'no-data';
		/** @type {((heading: number | null, source: HeadingSource) => void) | null} */
		this.onChange = null;
		/** @type {number} */
		this.lastCompassTs = 0;
		/** @type {number | null} */
		this.lastFixHeading = null;
		this.boundOrient = this.onOrientation.bind(this);
	}

	/**
	 * iOS 13+ gates device orientation behind an explicit permission that
	 * must be requested from a user gesture. Call from a click handler.
	 * @returns {Promise<boolean>} true when orientation events may flow.
	 */
	async requestPermissionIfNeeded() {
		const DOE = /** @type {any} */ (globalThis.DeviceOrientationEvent);
		if (typeof DOE?.requestPermission === 'function') {
			try {
				const answer = await DOE.requestPermission();
				if (answer !== 'granted') {
					this.set(null, 'permission');
					return false;
				}
			} catch {
				this.set(null, 'permission');
				return false;
			}
		}
		return true;
	}

	/**
	 * @param {(heading: number | null, source: HeadingSource) => void} onChange
	 */
	start(onChange) {
		this.onChange = onChange;
		// Absolute-orientation first (Android/Chrome); fall back to the
		// plain event (iOS gives webkitCompassHeading on it).
		if ('ondeviceorientationabsolute' in globalThis) {
			globalThis.addEventListener('deviceorientationabsolute', this.boundOrient, true);
		}
		globalThis.addEventListener('deviceorientation', this.boundOrient, true);
		this.set(null, 'no-data');
	}

	stop() {
		globalThis.removeEventListener('deviceorientationabsolute', this.boundOrient, true);
		globalThis.removeEventListener('deviceorientation', this.boundOrient, true);
		this.onChange = null;
	}

	/**
	 * GPS-course fallback: call with every location fix.
	 * @param {{ heading?: number, speed?: number }} fix
	 */
	updateFromFix(fix) {
		this.lastFixHeading = fix.heading ?? this.lastFixHeading;
		const moving = (fix.speed ?? 0) >= GPS_COURSE_MIN_SPEED_MPS;
		const compassFresh = Date.now() - this.lastCompassTs < COMPASS_STALE_MS;
		if (compassFresh || !moving || this.lastFixHeading == null) return;
		this.set(this.lastFixHeading, 'gps-course');
	}

	/**
	 * @param {DeviceOrientationEvent} ev
	 */
	onOrientation(ev) {
		/** @type {any} */
		const e = ev;
		// iOS: webkitCompassHeading is degrees clockwise from true north.
		if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
			this.lastCompassTs = Date.now();
			this.set(((e.webkitCompassHeading % 360) + 360) % 360, 'reading');
			return;
		}
		// Absolute alpha (deviceorientationabsolute): degrees clockwise
		// from north, when absolute === true. Relative alpha is worthless.
		if (typeof e.alpha === 'number' && e.absolute === true) {
			this.lastCompassTs = Date.now();
			this.set(((e.alpha % 360) + 360) % 360, 'reading');
		}
	}

	/**
	 * @param {number | null} heading
	 * @param {HeadingSource} source
	 */
	set(heading, source) {
		// A fresh compass reading always wins back from gps-course.
		if (this.source === 'gps-course' && source === 'reading') {
			// fallthrough by design
		}
		this.headingDeg = heading;
		this.source = source;
		this.onChange?.(heading, source);
	}
}
