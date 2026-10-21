// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		/** adapter-cloudflare: Worker bindings + vars (NOINDEX, config overrides). */
		interface Platform {
			env?: Record<string, unknown>;
		}
	}
}

export {};
