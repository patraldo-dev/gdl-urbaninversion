import { env as cfEnv } from 'cloudflare:workers';

/** @type {import('@sveltejs/kit/hooks').Handle} */
export const handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	// Staging only (NOINDEX=true in the staging wrangler env). /xr assets
	// get their noindex from static/_headers instead — they never invoke
	// the Worker. adapter-cloudflare v8 exposes vars via cloudflare:workers
	// (event.platform is null in production with this adapter).
	if (cfEnv && cfEnv['NOINDEX'] === 'true') {
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
