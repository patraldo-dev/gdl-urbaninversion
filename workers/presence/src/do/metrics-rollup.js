import { DurableObject } from 'cloudflare:workers';
import { presenceConfig } from '../env.js';

/**
 * MetricsRollup: one instance per parent geohash (idFromName over the
 * D1_GEOHASH_LEN prefix). Cell DOs report their per-bucket counts here, and
 * this class is the ONLY writer to D1 — it applies rollup-then-suppress
 * before persisting, so child cells under K_ANON never appear in D1 even
 * transiently.
 *
 * Storage holds counts only (bucket → { parent, children }), never
 * identifiers or positions. Late reports for already-flushed buckets are
 * dropped (documented loss on crash/retry races; counts are aggregates).
 */

/**
 * @typedef {object} ChildCounts
 * @property {number} open
 * @property {number} quiet
 * @property {number} observer
 */

/**
 * @typedef {object} BucketRecord
 * @property {string} parent
 * @property {Record<string, ChildCounts>} children
 */

const GRACE_MS = 5_000;
const BUCKET_PREFIX = 'b:';

export class MetricsRollup extends DurableObject {
	/** @type {import('@urbaninversion/shared').PresenceConfig | undefined} */
	cfg = undefined;

	/**
	 * @param {DurableObjectState} ctx
	 * @param {import('../env.js').Env} env
	 */
	constructor(ctx, env) {
		super(ctx, env);
		// Deliberately light: the constructor re-runs on every wake.
	}

	/** @returns {import('@urbaninversion/shared').PresenceConfig} */
	config() {
		this.cfg ??= presenceConfig(/** @type {import('../env.js').Env} */ (this.env));
		return this.cfg;
	}

	/**
	 * @param {Request} request
	 * @returns {Promise<Response>}
	  * @override
	 */
	async fetch(request) {
		const cfg = this.config();
		const url = new URL(request.url);
		if (url.pathname !== '/report' || request.method !== 'POST') {
			return new Response('not found', { status: 404 });
		}
		const body = /** @type {{ bucket?: unknown, parent?: unknown, child?: unknown, open?: unknown, quiet?: unknown, observer?: unknown } | null} */ (
			await request.json().catch(() => null)
		);
		const bucket = body?.bucket;
		const parent = body?.parent;
		const child = body?.child;
		const open = body?.open;
		const quiet = body?.quiet;
		const observer = body?.observer;
		/** @param {unknown} x @returns {x is number} */
		const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 1_000_000;
		if (
			typeof bucket !== 'number' ||
			!Number.isInteger(bucket) ||
			bucket % cfg.D1_BUCKET_S !== 0 ||
			typeof parent !== 'string' ||
			parent.length !== cfg.D1_GEOHASH_LEN ||
			typeof child !== 'string' ||
			child.length !== cfg.GEOHASH_PRECISION ||
			!child.startsWith(parent) ||
			!isCount(open) ||
			!isCount(quiet) ||
			!isCount(observer)
		) {
			return new Response('bad report', { status: 400 });
		}

		const now = Date.now();
		const dueAt = (bucket + cfg.D1_BUCKET_S) * 1000 + GRACE_MS;
		if (dueAt <= now) return new Response(null, { status: 204 }); // late report: dropped

		const key = `${BUCKET_PREFIX}${bucket}`;
		const record =
			/** @type {BucketRecord} */ ((await this.ctx.storage.get(key)) ?? { parent, children: {} });
		record.parent = parent;
		record.children[child] = { open, quiet, observer };
		await this.ctx.storage.put(key, record);
		await this.ensureAlarm(now);
		return new Response(null, { status: 204 });
	}

	/** @override */
	async alarm() {
		const cfg = this.config();
		const now = Date.now();
		const entries = /** @type {Map<string, BucketRecord>} */ (
			await this.ctx.storage.list({ prefix: BUCKET_PREFIX })
		);
		for (const [key, record] of entries) {
			const bucket = Number(key.slice(BUCKET_PREFIX.length));
			if (!Number.isInteger(bucket)) {
				await this.ctx.storage.delete(key);
				continue;
			}
			if ((bucket + cfg.D1_BUCKET_S) * 1000 + GRACE_MS > now) continue;

			let open = 0;
			let quiet = 0;
			let observer = 0;
			for (const c of Object.values(record.children)) {
				open += c.open;
				quiet += c.quiet;
				observer += c.observer;
			}
			// Rollup-then-suppress: the parent row is written only if the
			// rolled-up total clears K_ANON (total includes observers — see
			// packages/shared presence/kanon.js for the rationale).
			if (open + quiet + observer >= cfg.K_ANON) {
				await /** @type {D1Database} */ (/** @type {unknown} */ (this.env)).prepare(
					'INSERT OR REPLACE INTO presence_metrics (bucket_start, geohash4, open_count, quiet_count, observer_count) VALUES (?1, ?2, ?3, ?4, ?5)'
				)
					.bind(bucket, record.parent, open, quiet, observer)
					.run();
			}
			await this.ctx.storage.delete(key);
		}
		await this.ensureAlarm(now);
	}

	/**
	 * @param {number} now
	 */
	async ensureAlarm(now) {
		/** @type {number | null} */
		let next = null;
		const keys = await this.ctx.storage.list({ prefix: BUCKET_PREFIX });
		for (const key of keys.keys()) {
			const bucket = Number(key.slice(BUCKET_PREFIX.length));
			if (!Number.isInteger(bucket)) continue;
			const due = (bucket + this.config().D1_BUCKET_S) * 1000 + GRACE_MS;
			if (due > now && (next === null || due < next)) next = due;
		}
		const current = await this.ctx.storage.getAlarm();
		if (next === null) {
			if (current !== null) await this.ctx.storage.deleteAlarm();
			return;
		}
		// Only ever move the alarm earlier.
		if (current === null || current > next) await this.ctx.storage.setAlarm(next);
	}
}
