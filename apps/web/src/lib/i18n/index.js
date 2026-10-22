// i18n/index.js — same structure as patrouch.ca / ambientx greenroom:
// Svelte writable `locale` store + derived `t()` + build-time JSON imports.
// The cookie (`preferredLanguage`, set by /api/locale) is the source of
// truth — +layout.js seeds this store from it on both server and client,
// so SSR and hydration agree. setLocale also mirrors to localStorage
// (greenroom pattern) for a snappy client-side default if the cookie is
// ever absent. Default and fallback language: Spanish (GDL-first product).

/** @typedef {Record<string, string>} Dict */

import { writable, derived } from 'svelte/store';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

/** @type {Record<string, Dict>} */
const translations = { en, es, fr };
const STORAGE_KEY = 'urbaninversion_locale';

/** @type {string[]} */
export const locales = ['en', 'es', 'fr'];
export const locale = writable('es');

export const t = derived(locale, ($locale) => {
	/** @param {string} key */
	return (key) => {
		let translation = translations[$locale]?.[key];
		if (!translation) translation = translations[$locale]?.[key.toLowerCase()];
		// Fallback to Spanish (the product's primary language), then the key.
		if (!translation && $locale !== 'es') {
			translation = translations.es[key] || translations.es[key.toLowerCase()];
		}
		return translation || key;
	};
});

/** @param {string} newLocale */
export function setLocale(newLocale) {
	if (locales.includes(newLocale)) {
		locale.set(newLocale);
		try {
			localStorage.setItem(STORAGE_KEY, newLocale);
		} catch {
			/* SSR / private mode — cookie still holds the choice */
		}
	}
}

export function getLocale() {
	let current;
	locale.subscribe((v) => (current = v))();
	return current;
}
