/** @type {import('./$types').LayoutServerLoad} */
export async function load({ cookies }) {
	// The cookie set by /api/locale decides the locale for SSR.
	const serverLocale = cookies.get('preferredLanguage');
	return { serverLocale: ['en', 'es', 'fr'].includes(serverLocale ?? '') ? serverLocale : 'es' };
}
