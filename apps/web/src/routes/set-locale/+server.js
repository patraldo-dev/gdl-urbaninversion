// Sets the preferredLanguage cookie and redirects back — the patrouch.ca
// pattern. GET is what the nav switcher links to (works without JS wiring);
// POST (JSON) is available for programmatic switches. NOTE: this lives at
// /set-locale, NOT /api/locale — /api/* belongs to the presence Worker
// (more-specific edge route), so an /api path would never reach this Worker.
import { redirect } from '@sveltejs/kit';

const SUPPORTED = ['en', 'es', 'fr'];

export async function GET({ url, cookies }) {
	const lang = url.searchParams.get('lang');
	const redirectTo = url.searchParams.get('redirect') || '/';

	if (!lang || !SUPPORTED.includes(lang)) throw redirect(302, redirectTo);

	cookies.set('preferredLanguage', lang, {
		path: '/',
		maxAge: 365 * 24 * 60 * 60,
		sameSite: 'lax',
		httpOnly: false
	});

	throw redirect(302, redirectTo);
}

export async function POST({ request, cookies }) {
	const { locale } = await request.json();

	if (!SUPPORTED.includes(locale)) {
		return new Response(JSON.stringify({ error: 'Invalid locale' }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}

	cookies.set('preferredLanguage', locale, {
		path: '/',
		maxAge: 365 * 24 * 60 * 60,
		sameSite: 'lax',
		httpOnly: false
	});

	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'content-type': 'application/json' }
	});
}
