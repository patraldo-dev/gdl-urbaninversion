/**
 * HeadingProvider: the yaw offset that aligns the XR frame to geographic
 * north. WebXR exposes no compass — walk-to-calibrate is the v1 strategy
 * (Phase 1 correction 3): while the user walks above ~1.2 m/s, compare the
 * bearing of XR-space head displacement against the bearing of GPS-track
 * displacement and take a filtered circular median of the difference.
 *
 * // VERIFY: this assumes the runtime provides tracked (6DoF) head
 * positions. On the glasses web-app runtime that is expected to come from
 * the device toolkit's "device position" — verify on hardware. Without
 // tracked displacement the provider stays in 'no-data' and markers render
 * only with bucketed distance, un-oriented.
 *
 * @typedef {'no-data' | 'calibrating' | 'locked'} HeadingAlignmentState
 *
 * @typedef {object} HeadingProvider
 * @property {string} id
 * @property {() => number} getOffsetDeg Yaw offset (XR frame → true north), valid once locked.
 * @property {() => HeadingAlignmentState} getState
 * @property {() => string} getHint User-facing hint for the current state.
 * @property {(cameraPos: { x: number, z: number } | null, geoPrev: import('@urbaninversion/shared').LatLon | null, geoNow: import('@urbaninversion/shared').LatLon | null, tsMs: number) => void} update
 */

import { bearingDeg, haversineM } from '@urbaninversion/shared';

const MIN_SPEED_MPS = 1.2;
const MIN_GEO_STEP_M = 3;
const MIN_XR_STEP_M = 0.5;
const WINDOW_SAMPLES = 12;
const WINDOW_MS = 60_000;
const LOCK_SAMPLES = 6;
const LOCK_SPREAD_DEG = 15;

export class WalkToCalibrateHeadingProvider {
	constructor() {
		this.id = 'walk-to-calibrate';
		/** @type {{ x: number, z: number } | null} */
		this.lastCam = null;
		/** @type {import('@urbaninversion/shared').LatLon | null} */
		this.lastGeo = null;
		this.lastTsMs = 0;
		/** @type {{ offset: number, tsMs: number }[]} */
		this.samples = [];
		this.offsetDeg = 0;
		/** @type {HeadingAlignmentState} */
		this.state = 'no-data';
	}

	getOffsetDeg() {
		return this.offsetDeg;
	}

	getState() {
		return this.state;
	}

	getHint() {
		switch (this.state) {
			case 'locked':
				return '';
			case 'calibrating':
				return 'Alignment: low — walk straight for a few seconds';
			default:
				return 'Alignment: no tracked movement yet';
		}
	}

	/**
	 * @param {{ x: number, z: number } | null} cameraPos
	 * @param {import('@urbaninversion/shared').LatLon | null} geoPrev
	 * @param {import('@urbaninversion/shared').LatLon | null} geoNow
	 * @param {number} tsMs
	 */
	update(cameraPos, geoPrev, geoNow, tsMs) {
		const dt = this.lastTsMs === 0 ? 0 : (tsMs - this.lastTsMs) / 1000;
		const camPrev = this.lastCam;
		this.lastCam = cameraPos;
		this.lastGeo = geoNow;
		this.lastTsMs = tsMs;
		if (!cameraPos || !camPrev || !geoPrev || !geoNow || dt <= 0) {
			if (this.state !== 'locked') this.state = cameraPos ? 'calibrating' : 'no-data';
			return;
		}

		const geoDist = haversineM(geoPrev, geoNow);
		const camDist = Math.hypot(cameraPos.x - camPrev.x, cameraPos.z - camPrev.z);
		if (geoDist < MIN_GEO_STEP_M || camDist < MIN_XR_STEP_M) return;
		if (geoDist / dt < MIN_SPEED_MPS) return; // stationary GPS jitter is not a bearing

		// XR bearing uses the same convention as the renderer: 0° = -Z
		// (forward), increasing clockwise (east = +X).
		const xrBearing = (((Math.atan2(cameraPos.x - camPrev.x, -(cameraPos.z - camPrev.z)) * 180) / Math.PI) + 360) % 360;
		const geoBearing = bearingDeg(geoPrev, geoNow);
		const offset = (((geoBearing - xrBearing) % 360) + 360) % 360;

		this.samples.push({ offset, tsMs });
		this.samples = this.samples.filter((s) => tsMs - s.tsMs <= WINDOW_MS).slice(-WINDOW_SAMPLES);
		if (this.samples.length >= LOCK_SAMPLES) {
			this.offsetDeg = circularMedian(this.samples.map((s) => s.offset));
			const spread = circularSpread(this.samples.map((s) => s.offset));
			this.state = spread <= LOCK_SPREAD_DEG ? 'locked' : 'calibrating';
		} else {
			this.state = 'calibrating';
		}
	}
}

/**
 * @param {number[]} angles Degrees.
 * @returns {number}
 */
function circularMedian(angles) {
	const xs = angles.reduce((acc, a) => acc + Math.cos((a * Math.PI) / 180), 0);
	const ys = angles.reduce((acc, a) => acc + Math.sin((a * Math.PI) / 180), 0);
	return (((Math.atan2(ys, xs) * 180) / Math.PI) + 360) % 360;
}

/**
 * @param {number[]} angles Degrees.
 * @returns {number} Max pairwise angular distance, 0..180.
 */
function circularSpread(angles) {
	let max = 0;
	for (const a of angles) {
		for (const b of angles) {
			const d = Math.abs(((a - b) % 360 + 360) % 360);
			max = Math.max(max, Math.min(d, 360 - d));
		}
	}
	return max;
}
