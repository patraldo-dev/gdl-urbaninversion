import { configFromEnvVars, resolveConfig } from '@urbaninversion/shared';

/**
 * @typedef {object} Env
 * @property {DurableObjectNamespace} PRESENCE_CELL
 * @property {DurableObjectNamespace} METRICS_ROLLUP
 * @property {DurableObjectNamespace} PAIRING Global phone→glasses pairing instance.
 * @property {DurableObjectNamespace} PLACES Global place registry instance.
 * @property {D1Database} DB
 * @property {string[]} [ORIGIN_ALLOWLIST] Strict WebSocket Origin allowlist (per environment).
 * @property {string} [TURNSTILE_SITEKEY] Public Turnstile sitekey (exposed via /api/config; not a secret).
 * @property {string} [TURNSTILE_SECRET] siteverify secret — set with `wrangler secret put`, never in wrangler.jsonc.
 * @property {string} [GEO_SANITY_MAX_KM]
 */

/**
 * Resolve the effective presence config for this environment. Called once
 * per Worker invocation / DO wake and cached by callers. Numeric config
 * overrides ride on the env object and are picked up here.
 * @param {Env} env
 * @returns {import('@urbaninversion/shared').PresenceConfig}
 */
export function presenceConfig(env) {
	return resolveConfig(configFromEnvVars(/** @type {Record<string, unknown>} */ (env)));
}
