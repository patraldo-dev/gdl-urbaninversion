/**
 * PairingDO: phone→glasses session pairing, one global instance.
 *
 * The glasses display a short code (created here); a phone that just
 * passed a Turnstile challenge vouches for that code (the worker
 * siteverifies the phone's fresh token BEFORE calling vouch); the DO then
 * mints a single-use pairing ticket. The glasses' hello frame carries the
 * ticket in `pair` instead of a Turnstile token, and PresenceCell
 * consumes it here — transferring the phone's human-check to the glasses
 * session without any persistent identifier.
 *
 * Threat model: the ticket is a bearer proof that "a human solved
 * Turnstile on this origin minutes ago". Caps: codes expire in 5 min,
 * tickets in 10; one ticket per code; tickets are single-use; code
 * creation is capped per IP and globally. Nothing is persisted to disk —
 * a DO restart drops all pending codes (users just retry).
 */

const CODE_TTL_MS = 5 * 60_000;
const TICKET_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LEN = 6;
const MAX_PENDING = 50;
const PER_IP_CODES = 5;
const PER_IP_WINDOW_MS = 10 * 60_000;

export class PairingDO {
	constructor(state, env) {
		this.state = state;
		this.env = env;
		/** @type {Map<string, { expires: number, ticket: string | null }>} code → entry */
		this.codes = new Map();
		/** @type {Map<string, number>} ticket → expires */
		this.tickets = new Map();
		/** @type {Map<string, number[]>} ip → code-creation timestamps */
		this.ipCreates = new Map();
	}

	/** @param {number} now */
	sweep(now) {
		for (const [code, e] of this.codes) if (e.expires < now) this.codes.delete(code);
		for (const [t, exp] of this.tickets) if (exp < now) this.tickets.delete(t);
		for (const [ip, ts] of this.ipCreates) {
			const live = ts.filter((t) => now - t < PER_IP_WINDOW_MS);
			if (live.length === 0) this.ipCreates.delete(ip);
			else this.ipCreates.set(ip, live);
		}
	}

	/**
	 * @param {string} ip
	 * @param {number} now
	 * @returns {boolean}
	 */
	ipAllowed(ip, now) {
		if (!ip) return true;
		const ts = (this.ipCreates.get(ip) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS);
		return ts.length < PER_IP_CODES;
	}

	/**
	 * @param {number} now
	 * @returns {string}
	 */
	newCode(now) {
		for (let tries = 0; tries < 20; tries++) {
			let code = '';
			const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
			for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
			if (!this.codes.has(code)) {
				this.codes.set(code, { expires: now + CODE_TTL_MS, ticket: null });
				return code;
			}
		}
		// Astronomically unlikely; regenerate next request.
		return this.newCode(now);
	}

	/** @param {number} now @returns {string} */
	newTicket(now) {
		const bytes = crypto.getRandomValues(new Uint8Array(33));
		let s = '';
		for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
		const ticket = `pt_${s.toLowerCase()}`;
		this.tickets.set(ticket, now + TICKET_TTL_MS);
		return ticket;
	}

	/** @param {Request} request */
	async fetch(request) {
		const url = new URL(request.url);
		const now = Date.now();
		this.sweep(now);
		const json = (data, status = 200) =>
			new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

		if (url.pathname === '/code' && request.method === 'POST') {
			const ip = request.headers.get('x-ui-client-ip') ?? '';
			if (this.codes.size >= MAX_PENDING) return json({ error: 'busy' }, 503);
			if (!this.ipAllowed(ip, now)) return json({ error: 'rate_limited' }, 429);
			const code = this.newCode(now);
			if (ip) this.ipCreates.set(ip, [...(this.ipCreates.get(ip) ?? []), now]);
			return json({ code, expiresInS: Math.round(CODE_TTL_MS / 1000) });
		}

		if (url.pathname === '/vouch' && request.method === 'POST') {
			const code = url.searchParams.get('code') ?? '';
			const entry = this.codes.get(code);
			if (!entry || entry.expires < now) return json({ error: 'expired' }, 404);
			if (entry.ticket != null) return json({ error: 'already_vouched' }, 409);
			entry.ticket = this.newTicket(now);
			entry.expires = now + CODE_TTL_MS; // refresh so the glasses can collect it
			return json({ ok: true });
		}

		if (url.pathname === '/status' && request.method === 'GET') {
			const code = url.searchParams.get('code') ?? '';
			const entry = this.codes.get(code);
			if (!entry || entry.expires < now) return json({ status: 'expired' });
			if (entry.ticket == null) return json({ status: 'pending' });
			// Hand the ticket out once, then drop the code entirely.
			this.codes.delete(code);
			return json({ status: 'granted', ticket: entry.ticket, expiresInS: Math.round(TICKET_TTL_MS / 1000) });
		}

		if (url.pathname === '/consume' && request.method === 'POST') {
			const ticket = url.searchParams.get('ticket') ?? '';
			const exp = this.tickets.get(ticket);
			if (exp == null || exp < now) return json({ ok: false });
			this.tickets.delete(ticket); // single use
			return json({ ok: true });
		}

		return json({ error: 'not_found' }, 404);
	}
}
