import { destination } from '@urbaninversion/shared';

/**
 * Scripted walker for the simulation harness: advances along a fixed
 * bearing at a fixed speed, and produces GPS fixes with configurable noise
 * (σ meters, seeded — reproducible) plus compass-style heading noise for
 * the optional heading field.
 */
export class Walker {
	/**
	 * @param {import('@urbaninversion/shared').LatLon} start
	 * @param {object} [opts]
	 * @param {number} [opts.bearingDeg]
	 * @param {number} [opts.speedMps]
	 * @param {number} [opts.gpsNoiseM] σ of position noise (default 5 m).
	 * @param {number} [opts.compassNoiseDeg] σ of heading noise (default 8°).
	 * @param {number} [opts.seed]
	 */
	constructor(start, opts = {}) {
		this.truePos = { ...start };
		this.bearing = opts.bearingDeg ?? 90;
		this.speedMps = opts.speedMps ?? 1.4;
		this.gpsNoiseM = opts.gpsNoiseM ?? 5;
		this.compassNoiseDeg = opts.compassNoiseDeg ?? 8;
		this.rng = mulberry32(opts.seed ?? 42);
	}

	/**
	 * Advance dt seconds; returns a noisy fix at the new true position.
	 * @param {number} dtS
	 */
	step(dtS) {
		this.truePos = destination(this.truePos, this.bearing, this.speedMps * dtS);
		return this.fix();
	}

	/** Noisy fix at the current true position (without advancing). */
	fix() {
		const latM = this.gauss() * this.gpsNoiseM;
		const lonM = this.gauss() * this.gpsNoiseM;
		return {
			lat: this.truePos.lat + latM / 111_320,
			lon: this.truePos.lon + lonM / (111_320 * Math.cos((this.truePos.lat * Math.PI) / 180)),
			accuracy: this.gpsNoiseM * 2 + Math.abs(this.gauss()),
			heading: (this.bearing + this.gauss() * this.compassNoiseDeg + 360) % 360,
			speed: this.speedMps,
		};
	}

	/** Box–Muller over the seeded uniform RNG. */
	gauss() {
		let u = 0;
		let v = 0;
		while (u === 0) u = this.rng();
		while (v === 0) v = this.rng();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}
}

/** @param {number} seed @returns {() => number} */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
