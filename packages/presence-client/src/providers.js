/**
 * LocationProvider: how the client learns its own position. The glasses have
 * no GPS chip — the OS pairs with a phone and sources location from it, so
 * BrowserGeolocation on the glasses is plausibly phone-GPS-backed
 * // VERIFY: accuracy on device. Degraded accuracy is handled downstream
 * (aggregate-only), never by rejecting the provider here.
 *
 * @typedef {object} LocationFix
 * @property {number} lat
 * @property {number} lon
 * @property {number} accuracy Reported accuracy radius, meters.
 * @property {number} [heading] Degrees [0, 360), if the source provides one.
 * @property {number} [speed] m/s, if the source provides one.
 * @property {number} tsMs Unix ms of the fix (Date.now() at receipt).
 */

/**
 * @typedef {object} LocationProvider
 * @property {string} id
 * @property {(onFix: (fix: LocationFix) => void, onError: (msg: string) => void) => void} start
 * @property {() => void} stop
 */

/** Browser Geolocation API (glasses runtime / laptop dev). */
export class BrowserGeolocationProvider {
	constructor() {
		this.id = 'browser-geolocation';
		/** @type {number | null} */
		this.watchId = null;
	}

	/**
	 * @param {(fix: LocationFix) => void} onFix
	 * @param {(msg: string) => void} onError
	 */
	start(onFix, onError) {
		if (!('geolocation' in navigator)) {
			onError('geolocation unavailable in this runtime');
			return;
		}
		this.watchId = navigator.geolocation.watchPosition(
			(pos) => {
				/** @type {LocationFix} */
				const fix = {
					lat: pos.coords.latitude,
					lon: pos.coords.longitude,
					accuracy: pos.coords.accuracy ?? 100,
					tsMs: Date.now(),
				};
				if (pos.coords.heading !== null && pos.coords.heading !== undefined) fix.heading = pos.coords.heading;
				if (pos.coords.speed !== null && pos.coords.speed !== undefined) fix.speed = pos.coords.speed;
				onFix(fix);
			},
			(err) => onError(err.message),
			{ enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 }
		);
	}

	stop() {
		if (this.watchId !== null) {
			navigator.geolocation.clearWatch(this.watchId);
			this.watchId = null;
		}
	}
}

/**
 * Scripted walker for development and the Phase 2f simulation harness.
 * Loops a waypoint route at a fixed speed and adds Gaussian GPS noise
 * (default σ = 5 m) plus a matching accuracy figure, so the client behaves
 * like a real phone-backed fix.
 */
export class SimulatedLocationProvider {
	/**
	 * @param {object} [options]
	 * @param {import('@urbaninversion/shared').LatLon[]} [options.waypoints]
	 * @param {number} [options.speedMps]
	 * @param {number} [options.noiseM]
	 * @param {number} [options.intervalMs]
	 */
	constructor(options = {}) {
		this.id = 'simulated';
		/** @type {import('@urbaninversion/shared').LatLon[]} */
		this.waypoints = options.waypoints ?? [
			{ lat: 52.5208, lon: 13.4045 },
			{ lat: 52.5218, lon: 13.4062 },
			{ lat: 52.5229, lon: 13.4044 },
			{ lat: 52.5215, lon: 13.4027 },
		];
		this.speedMps = options.speedMps ?? 1.4;
		this.noiseM = options.noiseM ?? 5;
		this.intervalMs = options.intervalMs ?? 1_000;
		/** @type {ReturnType<typeof setInterval> | null} */
		this.timer = null;
		this.progress = 0; // meters along the loop
		this.totalM = 0;
		for (let i = 0; i < this.waypoints.length; i++) {
			const a = this.waypoints[i];
			const b = this.waypoints[(i + 1) % this.waypoints.length];
			this.totalM += Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
		}
	}

	/**
	 * @param {(fix: LocationFix) => void} onFix
	 * @param {(msg: string) => void} _onError
	 */
	start(onFix, _onError) {
		this.timer = setInterval(() => {
			this.progress = (this.progress + (this.speedMps * this.intervalMs) / 1000) % this.totalM;
			const { point, bearing } = this.pointAt(this.progress);
			onFix({
				lat: point.lat + this.gauss() * (this.noiseM / 111_320),
				lon: point.lon + (this.gauss() * this.noiseM) / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
				accuracy: this.noiseM * 2 + Math.random() * 3,
				heading: bearing,
				speed: this.speedMps,
				tsMs: Date.now(),
			});
		}, this.intervalMs);
	}

	stop() {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/**
	 * @param {number} meters
	 * @returns {{ point: import('@urbaninversion/shared').LatLon, bearing: number }}
	 */
	pointAt(meters) {
		let remaining = meters;
		for (let i = 0; i < this.waypoints.length; i++) {
			const a = this.waypoints[i];
			const b = this.waypoints[(i + 1) % this.waypoints.length];
			const dLatM = (b.lat - a.lat) * 111_320;
			const dLonM = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
			const len = Math.hypot(dLatM, dLonM);
			if (remaining <= len || i === this.waypoints.length - 1) {
				const t = len === 0 ? 0 : Math.min(1, remaining / len);
				return {
					point: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t },
					bearing: (((Math.atan2(dLonM, dLatM) * 180) / Math.PI) + 360) % 360,
				};
			}
			remaining -= len;
		}
		return { point: this.waypoints[0], bearing: 0 };
	}

	/** Box–Muller, roughly N(0,1). @returns {number} */
	gauss() {
		let u = 0;
		let v = 0;
		while (u === 0) u = Math.random();
		while (v === 0) v = Math.random();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}
}
