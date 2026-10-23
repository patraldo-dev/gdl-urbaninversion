<script>
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
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
		speechForMarker,
		rosterIntents
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
	let placeName = $state('');
	let nearbyPlaces = $state(/** @type {{ slug: string, display: string, meters?: number }[]} */ ([]));
	let placeSearching = $state(false);
	let showShare = $state(false);
	let shareQr = $state('');
	let copied = $state(false);

	/** Look up nearby places with ONE low-accuracy fix (then stop watching). */
	async function findNearby() {
		placeSearching = true;
		try {
			const pos = await new Promise((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: false,
					timeout: 10_000,
					maximumAge: 30_000
				});
			});
			const res = await fetch(
				`/api/places/nearby?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
			);
			const data = await res.json();
			nearbyPlaces = data.places ?? [];
		} catch {
			nearbyPlaces = [];
		} finally {
			placeSearching = false;
		}
	}

	/**
	 * Create-or-find a place by name and join its room.
	 * @param {string} rawName
	 * @param {boolean} create
	 */
	async function joinPlaceNamed(rawName, create) {
		if (!service) return;
		try {
			if (create) {
				let coords = {};
				try {
					const pos = await new Promise((resolve, reject) => {
						navigator.geolocation.getCurrentPosition(resolve, reject, {
							enableHighAccuracy: false,
							timeout: 8_000,
							maximumAge: 60_000
						});
					});
					coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
				} catch {
					/* a place without coords is still joinable by name */
				}
				const res = await fetch('/api/places', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: rawName, ...coords })
				});
				if (!res.ok) throw new Error('create failed');
				const data = await res.json();
				service.joinPlace(data.slug);
				placeName = data.display;
			} else {
				service.joinPlace(rawName);
				placeName = rawName;
			}
			await service.setState(snap.status.state === 'invisible' ? 'observer' : snap.status.state);
		} catch {
			placeName = '';
		}
	}

	function leavePlace() {
		service?.leavePlace();
		placeName = '';
		showShare = false;
	}

	/** slug → readable fallback ("cafe-aurora" → "Cafe Aurora"). */
	/** @param {string | null} slug @returns {string} */
	function prettify(slug) {
		return (slug ?? '').replace(/-/g, ' ').replace(/\b\w/g, (/** @type {string} */ c) => c.toUpperCase());
	}

	/** The join URL others scan — same place, zero install/account. */
	function placeUrl() {
		const slug = snap.status.placeSlug;
		if (!slug) return '';
		return `${window.location.origin}/hub?place=${encodeURIComponent(slug)}`;
	}

	async function toggleShare() {
		showShare = !showShare;
		if (showShare && !shareQr) {
			try {
				shareQr = await QRCode.toDataURL(placeUrl(), { margin: 1, width: 260 });
			} catch {
				shareQr = '';
			}
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(placeUrl());
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard needs a gesture + permissions; the QR still works.
		}
	}

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
		const intents = snap.status.placeSlug
			? rosterIntents(snap.markers, $locale)
			: markerIntents(snap.markers, geometry, snap.status.headingDeg, $locale);
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
		const params = new URLSearchParams(window.location.search);
		simulated = params.get('device') === 'simulated';
		const placeParam = params.get('place');
		audioOn = audioCuesEnabled();
		setAudioCuesLocale($locale);
		// Shareable place link: a fresh visitor (scanned a QR) must pass the
		// consent/Turnstile gate first, then land back here to auto-join.
		if (placeParam && sessionStorage.getItem('urbaninversion.consent') !== 'true') {
			window.location.replace(`/enter?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
			return;
		}
		service = bootstrapPresence({ devOverrides: { locale: $locale } });
		if (placeParam && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(placeParam)) {
			service.joinPlace(placeParam);
			placeName = placeParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		}
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

{#if !snap.status.placeSlug}
	<p class="meta">{geoLine}</p>
	<p class="meta dim">{headingLine}</p>

	{#if wakeLockSupported() && snap.status.state !== 'invisible' && snap.status.state !== 'observer'}
		<p class="meta dim">{$t('hub.wakelock_hint')}</p>
	{/if}
{/if}

<label class="audio">
	<input type="checkbox" checked={audioOn} onchange={toggleAudio} />
	<span>{audioOn ? $t('hub.audio_on') : $t('hub.audio_off')}</span>
</label>

{#if snap.status.placeSlug}
	<section class="place-card" aria-live="polite">
		<div class="place-banner">
			<h2>{$t('hub.place_at').replace('{place}', placeName || prettify(snap.status.placeSlug))}</h2>
			<div class="banner-actions">
				<button class="leave" onclick={toggleShare}>{$t('hub.place_share')}</button>
				<button class="leave" onclick={leavePlace}>{$t('hub.place_leave')}</button>
			</div>
		</div>
		{#if showShare}
			<div class="share">
				{#if shareQr}
					<img src={shareQr} alt="QR: {placeUrl()}" width="180" height="180" />
				{/if}
				<p class="meta dim">{$t('hub.place_scan_hint')}</p>
				<button class="leave" onclick={copyLink}>{copied ? $t('hub.place_copied') : $t('hub.place_copy')}</button>
			</div>
		{/if}
		<h3>{$t('hub.place_here')}</h3>
		{#if lines.length > 0}
			<ul class="roster">
				{#each lines as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
		{:else if summary}
			<p class="summary">{summary}</p>
		{:else}
			<p class="dim">{$t('hub.place_here_empty')}</p>
		{/if}
	</section>
{:else}
	<details class="place">
		<summary>{$t('hub.place_title')}</summary>
		<p class="meta dim">{$t('hub.place_hint')}</p>
		<h3>{$t('hub.place_nearby')}</h3>
		{#if placeSearching}
			<p class="meta dim">{$t('hub.place_searching')}</p>
		{:else if nearbyPlaces.length > 0}
			<ul class="nearby-list">
				{#each nearbyPlaces as p (p.slug)}
					<li>
						<button onclick={() => joinPlaceNamed(p.slug, false)}>{$t('hub.place_join')}</button>
						<span>{p.display}{p.meters != null ? ` · ${p.meters} m` : ''}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<button class="find" onclick={findNearby}>{$t('hub.place_nearby')}</button>
		<div class="pair-row">
			<input
				bind:value={placeName}
				placeholder={$t('hub.place_search_placeholder')}
				maxlength="60"
				onkeydown={(e) => e.key === 'Enter' && joinPlaceNamed(placeName, true)}
			/>
			<button onclick={() => joinPlaceNamed(placeName, true)}>{$t('hub.place_create')}</button>
		</div>
	</details>
{/if}

<section class="nearby" aria-live="polite">
	<h2>{snap.status.placeSlug ? $t('hub.nearby_title') : $t('hub.nearby_title')}</h2>
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
	.place-card {
		margin-top: 1.25rem;
		border: 2px solid var(--accent);
		border-radius: 14px;
		padding: 0.9rem 1.1rem;
	}
	.place-banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
	}
	.place-banner h2 {
		margin: 0;
	}
	.place-banner .leave {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: #fff;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.place-card h3 {
		margin: 0.8rem 0 0.3rem;
		font-size: 0.9rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.banner-actions {
		display: flex;
		gap: 0.5rem;
	}
	.share {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.8rem;
		padding: 0.8rem;
		border: 1px dashed var(--line);
		border-radius: 10px;
	}
	.share img {
		background: #fff;
		padding: 6px;
		border-radius: 8px;
	}
	.roster {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.roster li {
		font-size: 1.1rem;
		font-weight: 700;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: #fff;
	}
	.place {
		margin-top: 1rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.6rem 0.9rem;
	}
	.place summary {
		cursor: pointer;
		font-weight: 600;
	}
	.place h3 {
		margin: 0.8rem 0 0.3rem;
		font-size: 0.9rem;
	}
	.nearby-list {
		list-style: none;
		padding: 0;
		margin: 0 0 0.4rem;
	}
	.nearby-list li {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.35rem 0;
	}
	.nearby-list button {
		padding: 0.35rem 0.8rem;
		border: 0;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}
	.place .find {
		margin: 0.3rem 0 0.6rem;
		padding: 0.45rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.xr {
		margin-top: 2rem;
	}
</style>
