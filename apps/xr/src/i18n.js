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
	// No cookie = the site's server-rendered default: Spanish. (Browser
	// language is deliberately NOT consulted — the XR panel language must
	// match what the surrounding site showed, cookie or no cookie.)
	return 'es';
}

export const locale = detectLocale();
