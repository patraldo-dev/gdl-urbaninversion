/**
 * PresenceService: wires a device profile's providers to the
 * PresenceClient and publishes into the store for UIs. Framework-free —
 * the phone hub and HUD adapters share it.
 *
 * Consent-gated: nothing connects until setConsent(true) (the DOM
 * pre-session page provides the Turnstile token; the in-app toggle
 * provides the opt-in).
 */

import { defaultConfig, resolveConfig, randomClientId } from '@urbaninversion/shared';
import { PresenceClient } from './client.js';
import { presenceStore } from './store.js';
import { CompassHeadingProvider } from './heading.js';
import { profileIdFromUrl, resolveProfile } from './profiles.js';

const CONSENT_KEY = 'urbaninversion.consent';
const TOKEN_KEY = 'urbaninversion.turnstile';
const PAIR_KEY = 'urbaninversion.pairTicket';

/** @type {{ service: PresenceService | null }} */
export const presenceServiceHolder = { service: null };

export class PresenceService {
	/**
	 * @param {object} [options]
	 * @param {string} [options.profileId] Device profile id (see profiles.js); `?device=` overrides.
	 * @param {import('./profiles.js').ResolvedProfile} [options.profile] Pre-resolved profile (overrides profileId).
	 * @param {string} [options.apiBase] Defaults to same-origin.
	 * @param {string} [options.wsBase]
	 * @param {Partial<import('@urbaninversion/shared').DeviceProfile>} [options.devOverrides] Wire capability overrides; defaults come from the profile + navigator.
	 */
	constructor(options = {}) {
		this.profile = options.profile ?? resolveProfile(options.profileId ?? profileIdFromUrl());
		this.apiBase = options.apiBase ?? '';
		this.wsBase = options.wsBase;
		/** @type {PresenceClient | null} */
		this.client = null;
		this.locationProvider = this.profile.createLocationProvider();
		this.headingProvider = this.profile.createHeadingProvider();
		/** @type {import('./providers.js').LocationFix | null} */
		this.lastFix = null;
		this.decided = globalThis.sessionStorage?.getItem(CONSENT_KEY) != null;
		this.consented = globalThis.sessionStorage?.getItem(CONSENT_KEY) === 'true';
		this.started = false;
		this.dev = /** @type {import('@urbaninversion/shared').DeviceProfile} */ ({
			clientId: randomClientId(),
			...this.profile.defaultDev,
			...options.devOverrides,
		});
	}

	/** @param {boolean} value */
	setConsent(value) {
		this.decided = true;
		this.consented = value;
		globalThis.sessionStorage?.setItem(CONSENT_KEY, String(value));
		if (value) void this.start();
		else this.stop();
	}

	hasConsent() {
		return this.consented;
	}

	/** @param {string} token Turnstile token from the pre-session DOM page. */
	setTurnstileToken(token) {
		globalThis.sessionStorage?.setItem(TOKEN_KEY, token);
	}

	/**
	 * iOS 13+ gates device orientation behind a permission that must be
	 * requested from a user gesture — host apps call this inside a click
	 * handler before/alongside starting.
	 * @returns {Promise<boolean>}
	 */
	requestHeadingPermission() {
		if (this.headingProvider instanceof CompassHeadingProvider) {
			return this.headingProvider.requestPermissionIfNeeded();
		}
		return Promise.resolve(true);
	}

	async start() {
		if (this.started || !this.consented) return;
		this.started = true;
		const cfg = await this.fetchConfig();
		const token = globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? undefined;
		const pairTicket = globalThis.sessionStorage?.getItem(PAIR_KEY) ?? undefined;
		this.client = new PresenceClient({
			cfg,
			wsBase: this.wsBase,
			turnstileToken: token,
			pairTicket,
			dev: this.dev,
			onEvent: (kind, detail) => this.onClientEvent(kind, detail),
		});
		await this.client.start();
		this.locationProvider.start(
			(fix) => void this.onFix(fix),
			(msg) => presenceStore.patchStatus({ locationError: msg })
		);
		this.headingProvider.start((heading, source) =>
			presenceStore.patchStatus({ headingDeg: heading, headingSource: source })
		);
		presenceStore.patchStatus({ state: this.client.state, connected: true });
	}

	stop() {
		this.started = false;
		this.locationProvider.stop();
		this.headingProvider.stop();
		this.client?.close();
		this.client = null;
		presenceStore.setMarkers([]);
		presenceStore.setAggregate(null);
		presenceStore.patchStatus({ connected: false, headingDeg: null, headingSource: 'no-data' });
	}

	/**
	 * Resume after the page unfroze (visibilitychange): backgrounded mobile
	 * browsers freeze timers and can kill sockets. Providers resume on
	 * their own; this nudges a fresh geolocation fix (which re-drives
	 * position + cell sockets) instead of assuming anything about the
	 * previous session.
	 */
	resume() {
		if (!this.started) return;
		if (this.profile.useBrowserGeolocation && 'geolocation' in globalThis.navigator) {
			globalThis.navigator.geolocation.getCurrentPosition(
				() => {},
				() => {},
				{ maximumAge: 5_000, timeout: 10_000 }
			);
		}
	}

	/**
	 * @param {import('@urbaninversion/shared').PresenceState} state
	 */
	async setState(state) {
		presenceStore.patchStatus({ state });
		if (state === 'invisible') {
			this.stop();
			return;
		}
		await this.client?.setState(state);
	}

	/** @param {string} handle */
	async block(handle) {
		await this.client?.block(handle);
	}

	/** @returns {Promise<import('@urbaninversion/shared').PresenceConfig>} */
	async fetchConfig() {
		try {
			const res = await fetch(`${this.apiBase}/api/config`);
			/** @type {Record<string, unknown>} */
			const body = await res.json();
			/** @type {Partial<import('@urbaninversion/shared').PresenceConfig>} */
			const overrides = {};
			for (const key of Object.keys(defaultConfig)) {
				const v = body[key];
				if (typeof v === 'number') {
					/** @type {Record<string, unknown>} */ (overrides)[key] = v;
				}
			}
			if (body['quietVisibility'] === 'everyone' || body['quietVisibility'] === 'quiet_only' || body['quietVisibility'] === 'aggregate') {
				overrides.QUIET_VISIBILITY = body['quietVisibility'];
			}
			return resolveConfig(overrides);
		} catch {
			return resolveConfig();
		}
	}

	/**
	 * @param {import('./providers.js').LocationFix} fix
	 */
	async onFix(fix) {
		this.lastFix = fix;
		this.headingProvider.updateFromFix?.(fix);
		presenceStore.patchStatus({ accuracyM: fix.accuracy });
		await this.client?.updatePosition(fix);
	}

	/**
	 * @param {string} kind
	 * @param {unknown} detail
	 */
	onClientEvent(kind, detail) {
		switch (kind) {
			case 'hello-ack': {
				const ack = /** @type {import('@urbaninversion/shared').HelloAckFrame} */ (detail);
				presenceStore.patchStatus({
					distanceBucketM: ack.cfg.distanceBucketM,
					bearingBucketDeg: ack.cfg.bearingBucketDeg,
				});
				break;
			}
			case 'markers':
				presenceStore.setMarkers(/** @type {import('@urbaninversion/shared').MarkerEntry[]} */ (detail));
				break;
			case 'aggregate':
				presenceStore.setAggregate(/** @type {{ open: number, quiet: number }} */ (detail));
				break;
			case 'coarse-changed':
				presenceStore.patchStatus({ coarse: /** @type {boolean} */ (detail) });
				break;
			case 'socket-open':
				presenceStore.patchStatus({ connected: true });
				break;
			case 'closed':
				presenceStore.patchStatus({ connected: false });
				break;
		}
	}
}

/**
 * Construct + register the singleton host apps use.
 * @param {ConstructorParameters<typeof PresenceService>[0]} [options]
 */
export function bootstrapPresence(options) {
	const service = new PresenceService(options);
	presenceServiceHolder.service = service;
	if (service.hasConsent() && service.decided) void service.start();
	return service;
}
