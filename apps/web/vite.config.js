import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Workers Static Assets deployment; routes/vars/envs live in ./wrangler.jsonc
			// (production top-level + named `staging` environment).
			adapter: adapter({ config: 'wrangler.jsonc' })
		})
	]
});
