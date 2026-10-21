import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			// Top-level (production) environment: the plugin's DO test path
			// resolves same-worker DO bindings from the top level; the
			// staging `environment` selection dropped them. Origin vars are
			// irrelevant here — tests talk to the DO directly, and
			// TURNSTILE_SECRET / test knobs come from miniflare bindings.
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: {
					// Cloudflare's documented Turnstile test secret: the real
					// siteverify endpoint always passes it with the dummy
					// token. One real outbound call per hello.
					TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
					// Test knobs (within resolveConfig bounds): a wide
					// freshness window lets us backdate timestamps to
					// simulate TTL expiry without sleeping.
					STALENESS_WINDOW_S: '600',
					POSITION_TTL_S: '5',
				},
			},
		}),
	],
	test: {
		// Hellos hit the real Turnstile siteverify endpoint (test secret
		// always passes); cross-cell tests open several sockets.
		testTimeout: 30_000,
	},
});
