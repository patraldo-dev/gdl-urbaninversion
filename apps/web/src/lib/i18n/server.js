// i18n/server.js — server-side resolver (same structure as patrouch.ca):
// for any plain-JS server code that needs translated strings outside the
// Svelte store. Spanish fallback, then the key itself.
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

/** @type {Record<string, Record<string, string>>} */
const locales = { en, es, fr };

/** @param {string} [locale] */
export function getTranslation(locale = 'es') {
	const translation = locales[locale] || locales.es;

	/** @param {string} key */
	return function (key) {
		let result = translation[key];
		if (!result) result = translation[key.toLowerCase()];
		if (!result && locale !== 'es') {
			result = locales.es[key] || locales.es[key.toLowerCase()];
		}
		return result || key;
	};
}
