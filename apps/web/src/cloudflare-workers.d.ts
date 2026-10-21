/**
 * Ambient declaration for the `cloudflare:workers` module used by
 * adapter-cloudflare v8 (virtual module in dev, real module in the Worker).
 */
declare module 'cloudflare:workers' {
	export const env: Record<string, unknown>;
}
