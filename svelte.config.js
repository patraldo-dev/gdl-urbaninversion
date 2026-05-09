import adapter from "@sveltejs/adapter-cloudflare-workers";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ config: 'wrangler.jsonc' })
	}
};

export default config;