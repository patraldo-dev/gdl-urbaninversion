/**
 * Locale for the static XR bundle. The site's language switcher sets the
 * `preferredLanguage` cookie on the same origin, so the choice carries into
 * XR automatically; fall back to the browser language, then Spanish
 * (the product's default, matching apps/web).
 */
const SUPPORTED = /** @type {const} */ (['en', 'es', 'fr']);

function detectLocale() {
	try {
		const match = /(?:^|;\s*)preferredLanguage=(en|es|fr)/.exec(document.cookie);
		if (match) return match[1];
	} catch {
		/* no cookie access (should not happen in the static bundle) */
	}
	const nav =
		typeof navigator !== 'undefined' ? (navigator.language || '').slice(0, 2).toLowerCase() : '';
	return /** @type {readonly string[]} */ (SUPPORTED).includes(nav) ? nav : 'es';
}

export const locale = detectLocale();
