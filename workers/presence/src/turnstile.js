/**
 * Cloudflare Turnstile server-side validation (documented siteverify API):
 * POST https://challenges.cloudflare.com/turnstile/v0/siteverify with
 * form-encoded `secret`, `response`, and optional `remoteip`.
 *
 * Runs inside the cell DO at the hello frame — the token is generated on
 * the pre-session DOM page (Phase 1 correction 4) and carried in-band.
 * This is the session-creation Sybil-resistance layer; it provides message
 * integrity together with the per-frame did:key signature, not identity.
 */

/**
 * @param {string} token
 * @param {string} secret
 * @param {string} remoteIp
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(token, secret, remoteIp) {
	if (!secret) return false;
	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body,
		});
		if (!res.ok) return false;
		const data = /** @type {{ success?: unknown }} */ (await res.json());
		return data.success === true;
	} catch {
		return false;
	}
}
