<script>
	import { onMount } from 'svelte';
	import { t, locale } from '#lib/i18n/index.js';
	import {
		bootstrapPresence,
		presenceStore,
		speakCue,
		setAudioCuesEnabled,
		setAudioCuesLocale,
		audioCuesEnabled,
		acquireWakeLock,
		releaseWakeLock,
		wakeLockSupported,
		markerIntents,
		aggregateIntent,
		describeMarker,
		speechForMarker
	} from '@urbaninversion/presence-client';

	/**
	 * The phone hub: the v1 product client. Foreground presence — a locked
	 * or backgrounded screen freezes the page (geolocation, timers,
	 * sockets) on every mobile browser, so we hold a wake lock while
	 * active and clearly say so. All nearby lines come from the shared
	 * render-intent layer (privacy-safe bucketed facts, localized there).
	 */

	/** @type {import('@urbaninversion/presence-client').PresenceService | null} */
	let service = null;

	/**
	 * @typedef {{ status: any, markers: any[], aggregate: any }} Snap
	 */
	/** @type {Snap} */
	let snap = $state({
		status: presenceStore.getStatus(),
		markers: presenceStore.getMarkers(),
		aggregate: presenceStore.getAggregate()
	});
	/** @type {string[]} */
	let lines = $state([]);
	let summary = $state('');
	let audioOn = $state(false);
	let simulated = $state(false);
	let pairCode = $state('');
	let pairStatus = $state('');
	let pairing = $state(false);

	/**
	 * Vouch for the glasses' pairing code: a fresh Turnstile token is
	 * verified server-side at /api/pair/vouch — the human check that the
	 * glasses never has to perform itself.
	 */
	async function pairGlasses() {
		const code = pairCode.trim().toUpperCase();
		if (!/^[A-Z2-9]{6}$/.test(code)) {
			pairStatus = $t('hub.pair_fail');
			return;
		}
		pairing = true;
		pairStatus = $t('hub.pair_checking');
		try {
			// Load Turnstile on demand (same pattern as /enter).
			if (!document.getElementById('turnstile-script')) {
				await new Promise((resolve, reject) => {
					const sc = document.createElement('script');
					sc.id = 'turnstile-script';
					sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
					sc.onload = resolve;
					sc.onerror = () => reject(new Error('load'));
					document.head.appendChild(sc);
				});
			}
			const api = /** @type {any} */ (window);
			while (typeof api.turnstile?.render !== 'function') {
				await new Promise((r) => setTimeout(r, 100));
			}
			const cfg = await (await fetch('/api/config')).json();
			const token = await new Promise((resolve, reject) => {
				const holder = document.createElement('div');
				holder.style.display = 'none';
				document.body.appendChild(holder);
				api.turnstile.render(holder, {
					sitekey: cfg.turnstileSitekey,
					callback: resolve,
					'error-callback': () => reject(new Error('turnstile')),
					'timeout-callback': () => reject(new Error('timeout'))
				});
				setTimeout(() => reject(new Error('timeout')), 20_000);
			});
			const res = await fetch('/api/pair/vouch', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code, turnstile: token })
			});
			pairStatus = res.ok ? $t('hub.pair_success') : $t('hub.pair_fail');
			if (res.ok) pairCode = '';
		} catch {
			pairStatus = $t('hub.pair_fail');
		} finally {
			pairing = false;
		}
	}

	function refresh() {
		snap = {
			status: presenceStore.getStatus(),
			markers: presenceStore.getMarkers(),
			aggregate: presenceStore.getAggregate()
		};
		const geometry = {
			distanceBucketM: snap.status.distanceBucketM ?? 10,
			bearingBucketDeg: snap.status.bearingBucketDeg ?? 45
		};
		const intents = markerIntents(snap.markers, geometry, snap.status.headingDeg, $locale);
		lines = intents
			.filter((/** @type {{ kind: string }} */ i) => i.kind === 'text_line')
			.map((/** @type {{ text: string }} */ i) => i.text);
		summary = snap.aggregate ? aggregateIntent(snap.aggregate, $locale).text : '';
		// One spoken cue for the nearest person (rate-limited inside audio-cues).
		if (snap.markers.length > 0 && snap.status.headingDeg != null) {
			const nearest = [...snap.markers]
				.map((m) => describeMarker(m, geometry, snap.status.headingDeg, $locale))
				.sort((a, b) => a.meters - b.meters)[0];
			speakCue(speechForMarker(nearest, $locale).text);
		} else if (snap.aggregate && snap.markers.length === 0) {
			speakCue(aggregateIntent(snap.aggregate, $locale).text);
		}
	}

	/** @param {'open' | 'quiet' | 'observer' | 'invisible'} state */
	async function activate(state) {
		if (!service) return;
		// iOS orientation permission must come from this user gesture.
		if (state !== 'invisible') await service.requestHeadingPermission();
		await service.setState(state);
		if (state === 'invisible') {
			await releaseWakeLock();
		} else {
			await acquireWakeLock();
		}
	}

	function toggleAudio() {
		audioOn = !audioOn;
		setAudioCuesEnabled(audioOn);
		setAudioCuesLocale($locale);
	}

	onMount(() => {
		simulated = new URLSearchParams(window.location.search).get('device') === 'simulated';
		audioOn = audioCuesEnabled();
		setAudioCuesLocale($locale);
		service = bootstrapPresence({ devOverrides: { locale: $locale } });
		const off = presenceStore.subscribe(refresh);
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				service?.resume();
				if (service?.hasConsent() && service.started) void acquireWakeLock();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			off();
			document.removeEventListener('visibilitychange', onVisible);
			service?.stop();
		};
	});

	const STATES = /** @type {const} */ ([
		['open', 'state_open', 'pill open'],
		['quiet', 'state_quiet', 'pill quiet'],
		['observer', 'state_observer', 'pill observer'],
		['invisible', 'state_invisible', 'pill quiet']
	]);

	const geoLine = $derived(
		snap.status.locationError.includes('denied')
			? $t('hub.geo_denied')
			: snap.status.locationError
				? $t('hub.geo_unavailable')
				: snap.status.accuracyM
					? `${$t('hub.accuracy')} ~${Math.round(snap.status.accuracyM)} m`
					: $t('hub.geo_waiting')
	);
	const headingLine = $derived(
		snap.status.headingSource === 'reading'
			? $t('hub.heading_reading')
			: snap.status.headingSource === 'gps-course'
				? $t('hub.heading_course')
				: $t('hub.heading_none')
	);
</script>

<svelte:head>
	<title>{$t('meta.title_home')}</title>
</svelte:head>

<h1>{$t('hub.title')}</h1>
<p class="lede">{$t('hub.tagline')}</p>

{#if simulated}
	<p class="sim">{$t('hub.sim_notice')}</p>
{/if}

<p class="conn" role="status">
	<span class="dot {snap.status.connected ? 'on' : ''}" aria-hidden="true"></span>
	{snap.status.connected ? $t('hub.connected') : $t('hub.offline')}
</p>

<div class="toggle" role="group" aria-label={$t('hub.title')}>
	{#each STATES as [value, key, cls] (value)}
		<button
			class={cls}
			aria-pressed={snap.status.state === value}
			onclick={() => activate(value)}
		>
			{$t(`hub.${key}`)}
		</button>
	{/each}
</div>

<p class="meta">{geoLine}</p>
<p class="meta dim">{headingLine}</p>

{#if wakeLockSupported() && snap.status.state !== 'invisible' && snap.status.state !== 'observer'}
	<p class="meta dim">{$t('hub.wakelock_hint')}</p>
{/if}

<label class="audio">
	<input type="checkbox" checked={audioOn} onchange={toggleAudio} />
	<span>{audioOn ? $t('hub.audio_on') : $t('hub.audio_off')}</span>
</label>

<section class="nearby" aria-live="polite">
	<h2>{$t('hub.nearby_title')}</h2>
	{#if lines.length > 0}
		<ul>
			{#each lines as line (line)}
				<li>{line}</li>
			{/each}
		</ul>
	{:else if summary}
		<p class="summary">{summary}</p>
	{:else}
		<p class="dim">{$t('hub.nearby_empty')}</p>
	{/if}
</section>

<details class="pair">
	<summary>{$t('hub.pair_title')}</summary>
	<p class="meta dim">{$t('hub.pair_hint')}</p>
	<div class="pair-row">
		<input
			bind:value={pairCode}
			placeholder={$t('hub.pair_placeholder')}
			maxlength="6"
			autocomplete="off"
			spellcheck="false"
			onkeydown={(e) => e.key === 'Enter' && pairGlasses()}
		/>
		<button onclick={pairGlasses} disabled={pairing}>{$t('hub.pair_button')}</button>
	</div>
	{#if pairStatus}<p class="meta" role="status">{pairStatus}</p>{/if}
</details>

<p class="xr"><a href="/xr/">{$t('hub.xr_link')} →</a></p>

<style>
	.conn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
	}
	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: #b91c1c;
	}
	.dot.on {
		background: #1d6b3f;
	}
	.toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin: 1rem 0;
	}
	.toggle button {
		padding: 0.9rem 0.6rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: #fff;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		text-align: center;
	}
	.toggle button[aria-pressed='true'] {
		outline: 3px solid var(--accent);
		outline-offset: 1px;
	}
	.meta {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.meta.dim {
		opacity: 0.8;
	}
	.sim {
		padding: 0.6rem 0.9rem;
		border: 1px dashed var(--line);
		border-radius: 8px;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.audio {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 1rem 0;
		font-size: 0.95rem;
	}
	.nearby h2 {
		margin-top: 1.5rem;
	}
	.nearby ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.nearby li {
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.4;
		padding: 0.6rem 0.9rem;
		margin: 0.45rem 0;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: #fff;
	}
	.summary {
		font-size: 1.15rem;
		font-weight: 600;
	}
	.dim {
		color: var(--muted);
	}
	.pair {
		margin-top: 1.5rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.6rem 0.9rem;
	}
	.pair summary {
		cursor: pointer;
		font-weight: 600;
	}
	.pair-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.pair-row input {
		flex: 1;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		font-size: 1.05rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.pair-row button {
		padding: 0.7rem 1.1rem;
		border: 0;
		border-radius: 10px;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}
	.pair-row button:disabled {
		opacity: 0.6;
	}
	.xr {
		margin-top: 2rem;
	}
</style>
