/**
 * Test imports from 'cloudflare:test' / 'cloudflare:workers' are declared by
 * @cloudflare/vitest-plugin/types (added to tsconfig); the Cloudflare.Env
 * ambient namespace normally comes from `wrangler types` — declared here
 * instead, matching src/env.js.
 */
declare namespace Cloudflare {
	interface Env {
		PRESENCE_CELL: DurableObjectNamespace;
		METRICS_ROLLUP: DurableObjectNamespace;
		DB: D1Database;
		ORIGIN_ALLOWLIST?: string[];
		TURNSTILE_SITEKEY?: string;
		TURNSTILE_SECRET?: string;
		[key: string]: unknown;
	}
}
