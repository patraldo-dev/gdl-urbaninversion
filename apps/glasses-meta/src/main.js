/**
 * Urban Inversion — Meta Ray-Ban Display HUD adapter.
 *
 * Pairing flow (no challenge ever runs on the glasses): this page
 * requests a short code from the pairing DO and displays it; the user
 * types the code into their phone (which performs the Turnstile human
 * check at /api/pair/vouch); the granted single-use ticket is stored and
 * sent as hello.pair by the shared presence runtime.
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

const STRINGS = {
	en: {
		gate: 'Pairing — enter this code in your phone\u2019s Urban Inversion app:',
		waiting: 'Waiting for your phone…',
		granted: 'Paired!',
		expired: 'Code expired — generating a new one…',
		unavailable: 'Pairing unavailable — check connection.',
	},
	es: {
		gate: 'Vinculación — introduce este código en la app de Urban Inversion de tu teléfono:',
		waiting: 'Esperando tu teléfono…',
		granted: '¡Vinculado!',
		expired: 'Código expirado — generando uno nuevo…',
		unavailable: 'Vinculación no disponible — revisa la conexión.',
	},
	fr: {
		gate: 'Appairage — saisissez ce code dans l\u2019app Urban Inversion de votre téléphone :',
		waiting: 'En attente de votre téléphone…',
		granted: 'Appairé !',
		expired: 'Code expiré — génération d\u2019un nouveau…',
		unavailable: 'Appairage indisponible — vérifiez la connexion.',
	},
};

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const locale = (navigator.language || 'en').slice(0, 2);
const S = STRINGS[locale] ?? STRINGS.en;
setAudioCuesLocale(locale);

const PAIR_KEY = 'urbaninversion.pairTicket';
let pollTimer = null;
let service = null;

// ------------------------------------------------------------------ pairing
async function requestCode() {
	stopPolling();
	$('code').textContent = '······';
	$('pair-status').textContent = '';
	try {
		const res = await fetch('/api/pair/code', { method: 'POST' });
		if (!res.ok) throw new Error(String(res.status));
		const data = await res.json();
		$('gate-text').textContent = S.gate;
		$('code').textContent = data.code;
		$('pair-status').textContent = S.waiting;
		poll(data.code);
	} catch {
		$('pair-status').textContent = S.unavailable;
		setTimeout(requestCode, 10_000);
	}
}

/**
 * @param {string} code
 */
function poll(code) {
	pollTimer = setInterval(async () => {
		try {
			const res = await fetch(`/api/pair/status?code=${encodeURIComponent(code)}`);
			const data = await res.json();
			if (data.status === 'granted') {
				stopPolling();
				sessionStorage.setItem(PAIR_KEY, data.ticket);
				$('pair-status').textContent = S.granted;
				startHud();
			} else if (data.status === 'expired') {
				stopPolling();
				$('pair-status').textContent = S.expired;
				setTimeout(requestCode, 2_500);
			}
		} catch {
			// Transient network loss: keep polling.
		}
	}, 2_000);
}

function stopPolling() {
	if (pollTimer != null) clearInterval(pollTimer);
	pollTimer = null;
}

// ------------------------------------------------------------------- render
function render() {
	const status = presenceStore.getStatus();
	$('conn').classList.toggle('on', status.connected);
	$('conn-text').textContent = status.connected ? 'Live' : 'Reconnecting…';
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
		$('sub').textContent = lines.slice(1).join(' · ');
	} else if (aggregate) {
		$('main').textContent = aggregateIntent(aggregate, locale).text;
		$('sub').textContent = '';
	} else {
		$('main').textContent = '…';
		$('sub').textContent = status.locationError || '';
	}
	if (status.locationError) $('sub').textContent = status.locationError;
	if (audioCuesEnabled()) speakCue($('main').textContent || '');
}

// --------------------------------------------------------------------- boot
function startHud() {
	$('gate').hidden = true;
	$('hud').hidden = false;
	sessionStorage.setItem('urbaninversion.consent', 'true');
	service = bootstrapPresence({ profileId: 'hud2d', devOverrides: { locale } });
	presenceStore.subscribe(render);
}

const STATES = /** @type {const} */ (['open', 'quiet', 'observer', 'invisible']);
let stateIdx = 0;

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

$('newcode').addEventListener('click', () => void requestCode());

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') service?.resume();
});

// Already-paired session (same tab reloaded within ticket TTL): skip the gate.
if (sessionStorage.getItem(PAIR_KEY)) {
	startHud();
} else {
	void requestCode();
}
