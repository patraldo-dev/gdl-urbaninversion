// Same wiring as patrouch.ca: the server already picked the locale from the
// cookie; seed the store here so SSR and hydration render the same language.
import { setLocale } from '#lib/i18n/index.js';

/** @type {import('./$types').LayoutLoad} */
export async function load({ data }) {
	setLocale(data.serverLocale || 'es');
	return { ...data };
}
