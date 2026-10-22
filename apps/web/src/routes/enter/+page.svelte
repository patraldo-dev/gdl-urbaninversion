<script>
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.js';

	// Turnstile runs HERE, on the ordinary DOM page, before the XR session
	// starts (it cannot render inside an immersive session); the token rides
	// in the WebSocket hello frame afterwards. In `vite dev` there is no
	// /api on :5173 — we fall back to Cloudflare's documented test sitekey
	// (always passes) so local development works end to end.
	const TEST_SITEKEY = '1x00000000000000000000AA';

	let sitekey = '';
	let token = $state('');
	let consented = $state(false);
	/** @type {string | undefined} */
	let widgetId;
	let status = $state('');

	/** @type {typeof window & { turnstile?: { render: (sel: string, opts: Record<string, unknown>) => string } }} */
	const api = window;

	onMount(async () => {
		try {
			try {
				const res = await fetch('/api/config');
				const cfg = await res.json();
				sitekey = cfg.turnstileSitekey || TEST_SITEKEY;
			} catch {
				sitekey = TEST_SITEKEY;
			}
			await loadTurnstile();
			widgetId = api.turnstile?.render('#turnstile', {
				sitekey,
				callback: (/** @type {string} */ t) => (token = t),
				'error-callback': () => (status = $t('enter.error')),
				'expired-callback': () => (token = '')
			});
		} catch {
			// Script blocked (ad-blocker stubs window.turnstile as a plain
			// object), failed, or the API never finished initializing — the
			// button stays disabled and the visitor sees why.
			status = $t('enter.error');
		}
	});

	async function loadTurnstile() {
		// Gate on the FUNCTION, not the object: privacy extensions stub
		// window.turnstile as a truthy object without render(), and api.js
		// can define the object before its methods are wired up.
		if (typeof api.turnstile?.render === 'function') return;
		if (!document.getElementById('turnstile-script')) {
			await new Promise((resolve, reject) => {
				const s = document.createElement('script');
				s.id = 'turnstile-script';
				s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				s.async = true;
				s.onload = () => resolve(undefined);
				s.onerror = () => reject(new Error('turnstile load failed'));
				document.head.appendChild(s);
			});
		}
		const deadline = Date.now() + 10_000;
		while (typeof api.turnstile?.render !== 'function') {
			if (Date.now() > deadline) throw new Error('turnstile unavailable');
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	function enter() {
		if (!consented || !token) return;
		// Keys read by the XR app's PresenceService (session storage only).
		sessionStorage.setItem('urbaninversion.consent', 'true');
		sessionStorage.setItem('urbaninversion.turnstile', token);
		window.location.href = '/xr/';
	}
</script>

<svelte:head>
	<title>{$t('meta.title_enter')}</title>
</svelte:head>

<h1>{$t('enter.title')}</h1>

<p class="lede">{$t('enter.lede')}</p>

<label class="consent">
	<input type="checkbox" bind:checked={consented} />
	<span>
		{$t('enter.consent_a')}
		<a href="/privacy">{$t('nav.privacy')}</a>{$t('enter.consent_b')}
	</span>
</label>

<div id="turnstile"></div>

<p class="status" role="status">{status}</p>

<button class="enter" disabled={!consented || !token} onclick={enter}>
	{$t('enter.button')}
</button>

<style>
	.consent {
		display: flex;
		gap: 0.7rem;
		align-items: flex-start;
		margin: 1.5rem 0;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: #fff;
	}
	.consent input {
		margin-top: 0.35rem;
		scale: 1.3;
	}
	#turnstile {
		min-height: 65px;
		margin: 1rem 0;
	}
	.status {
		min-height: 1.2em;
		color: #a35b00;
	}
	.enter {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--bg);
		background: var(--accent);
		border: none;
		border-radius: 999px;
		padding: 0.7rem 1.6rem;
		cursor: pointer;
	}
	.enter:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
