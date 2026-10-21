/**
 * In-memory token bucket for per-connection rate limiting in the Durable
 * Object. No timers (hibernation-safe): time is passed in by the caller, and
 * `toJSON`/`fromJSON` allow persisting the bucket state in a socket
 * attachment if the DO wants continuity across wakes. Buckets that are not
 * persisted simply reset on wake — a looser limit, which is accepted.
 */

/**
 * @typedef {object} TokenBucketState
 * @property {number} tokens
 * @property {number} lastRefillMs
 */

export class TokenBucket {
	/** @type {number} */
	capacity;
	/** @type {number} */
	refillPerSec;
	/** @type {number} */
	tokens;
	/** @type {number} */
	lastRefillMs;

	/**
	 * @param {number} capacity
	 * @param {number} refillPerSec
	 * @param {number} nowMs
	 */
	constructor(capacity, refillPerSec, nowMs) {
		this.capacity = capacity;
		this.refillPerSec = refillPerSec;
		this.tokens = capacity;
		this.lastRefillMs = nowMs;
	}

	/** @param {number} nowMs */
	refill(nowMs) {
		const dt = (nowMs - this.lastRefillMs) / 1000;
		if (dt > 0) {
			this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
			this.lastRefillMs = nowMs;
		}
	}

	/**
	 * @param {number} nowMs
	 * @param {number} [n]
	 * @returns {boolean}
	 */
	take(nowMs, n = 1) {
		this.refill(nowMs);
		if (this.tokens >= n) {
			this.tokens -= n;
			return true;
		}
		return false;
	}

	/** @returns {TokenBucketState} */
	toJSON() {
		return { tokens: this.tokens, lastRefillMs: this.lastRefillMs };
	}

	/**
	 * @param {number} capacity
	 * @param {number} refillPerSec
	 * @param {TokenBucketState | undefined} state
	 * @param {number} nowMs
	 * @returns {TokenBucket}
	 */
	static fromJSON(capacity, refillPerSec, state, nowMs) {
		const b = new TokenBucket(capacity, refillPerSec, nowMs);
		if (state) {
			b.tokens = Math.min(capacity, Math.max(0, state.tokens));
			b.lastRefillMs = Math.min(state.lastRefillMs, nowMs);
		}
		return b;
	}
}
