/**
 * Urban Inversion — Meta Ray-Ban Display HUD adapter.
 *
 * A thin client: declare capabilities (DeviceProfile display 'hud2d'),
 * connect over the same signed WebSocket protocol, and render the shared
 * render-intents as one compact high-contrast line plus a status row.
 * The Turnstile session challenge runs inline (the glasses browser is a
 * normal web runtime); whether the challenge UX is acceptable on-device
 * is a hardware VERIFY item.
 */
import {
	bootstrapPresence,
	presenceStore,
	markerIntents,
	aggregateIntent,
	speakCue,
	audioCuesEnabled,
	setAudioCuesEnabled,
	setAudioCuesLocale,
} from '@urbaninversion/presence-client';

const TEST_SITEKEY = '1x00000000000000000000AA'; // always-pass (dev fallback)

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const locale = (navigator.language || 'en').slice(0, 8);
setAudioCuesLocale(locale);

let token = '';
let service = null;

// ---------------------------------------------------------------- Turnstile
async function loadTurnstileToken() {
	const status = $('gate-status');
	status.textContent = 'Loading session check…';
	try {
		let cfg = {};
		try {
			cfg = await (await fetch('/api/config')).json();
		} catch {
			/* config optional in dev */
		}
		const sitekey = cfg.turnstileSitekey || TEST_SITEKEY;
		if (!document.getElementById('turnstile-script')) {
			await new Promise((resolve, reject) => {
				const s = document.createElement('script');
				s.id = 'turnstile-script';
				s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				s.onload = resolve;
				s.onerror = () => reject(new Error('turnstile load failed'));
				document.head.appendChild(s);
			});
		}
		const api = /** @type {any} */ (window);
		while (typeof api.turnstile?.render !== 'function') {
			await new Promise((r) => setTimeout(r, 100));
		}
		api.turnstile.render('#turnstile', {
			sitekey,
			callback: (t) => {
				token = t;
				/** @type {HTMLButtonElement} */ ($('start')).disabled = false;
				status.textContent = '';
			},
			'error-callback': () => {
				status.textContent = 'Session check failed — reload to retry.';
			},
		});
	} catch {
		status.textContent = 'Session check unavailable — reload to retry.';
	}
}

// ------------------------------------------------------------------- render
function render() {
	const status = presenceStore.getStatus();
	const connected = status.connected;
	$('conn').classList.toggle('on', connected);
	$('conn-text').textContent = connected ? 'Live' : 'Reconnecting…';
	$('self').textContent = status.state.toUpperCase();

	const geometry = {
		distanceBucketM: status.distanceBucketM ?? 10,
		bearingBucketDeg: status.bearingBucketDeg ?? 45,
	};
	const lines = markerIntents(presenceStore.getMarkers(), geometry, status.headingDeg, locale)
		.filter((i) => i.kind === 'text_line')
		.map((i) => i.text);
	const aggregate = presenceStore.getAggregate();
	if (lines.length > 0) {
		$('main').textContent = lines[0];
		$('sub').textContent = lines.slice(1).join(' · ') || (status.headingDeg == null ? '' : '');
	} else if (aggregate) {
		$('main').textContent = aggregateIntent(aggregate, locale).text;
		$('sub').textContent = '';
	} else {
		$('main').textContent = '…';
		$('sub').textContent = status.locationError || '';
	}
	if (status.locationError) $('sub').textContent = status.locationError;
	// Spoken cue mirrors the main line for audio-first use.
	if (audioCuesEnabled()) speakCue($('main').textContent || '');
}

// ------------------------------------------------------------------- start
const STATES = /** @type {const} */ (['open', 'quiet', 'observer', 'invisible']);
let stateIdx = 0;

$('start').addEventListener('click', () => {
	if (!token) return;
	sessionStorage.setItem('urbaninversion.consent', 'true');
	sessionStorage.setItem('urbaninversion.turnstile', token);
	$('gate').hidden = true;
	$('hud').hidden = false;
	service = bootstrapPresence({ profileId: 'hud2d', devOverrides: { locale } });
	presenceStore.subscribe(render);
});

$('cycle').addEventListener('click', () => {
	if (!service) return;
	stateIdx = (stateIdx + 1) % STATES.length;
	void service.setState(STATES[stateIdx]);
	$('cycle').textContent = `State: ${STATES[stateIdx]}`;
});

$('audio').addEventListener('click', () => {
	const next = !audioCuesEnabled();
	setAudioCuesEnabled(next);
	$('audio').textContent = next ? 'Audio: on' : 'Audio: off';
	if (next) speakCue('Audio cues on');
});

$('audio').textContent = 'Audio: off';

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') service?.resume();
});

void loadTurnstileToken();
