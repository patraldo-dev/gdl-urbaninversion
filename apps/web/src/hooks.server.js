/** @type {import('@sveltejs/kit/hooks').Handle} */
export const handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	// Staging only (NOINDEX=true in the staging wrangler env). /xr assets
	// get their noindex from static/_headers instead — they never hit this
	// hook, because the assets layer serves them without invoking the Worker.
	const env = event.platform?.env;
	if (env && typeof env === 'object' && 'NOINDEX' in env) {
		/** @type {unknown} */
		const noindex = env['NOINDEX'];
		if (noindex === 'true') response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
