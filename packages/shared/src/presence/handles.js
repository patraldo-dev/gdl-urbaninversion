import { isB64Url } from '../crypto.js';

/**
 * Rotating opaque handles. A handle identifies a nearby member only within
 * the current epoch; it is never a did, never stable across sessions, and is
 * generated server-side. Clients resolve blocks against the handle at
 * receive time, so rotation does not silently unblock anyone.
 */

/** @typedef {string} Handle */

/**
 * Current rotation epoch; a member's handle changes when this changes.
 * @param {number} tsMs
 * @param {number} rotationS
 * @returns {number}
 */
export function handleEpoch(tsMs, rotationS) {
	return Math.floor(tsMs / 1000 / rotationS);
}

/**
 * @param {string} handle
 * @returns {boolean}
 */
export function isValidHandle(handle) {
	return isB64Url(handle) && handle.length >= 8 && handle.length <= 16;
}
