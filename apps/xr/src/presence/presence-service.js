import { defaultConfig, resolveConfig } from '@urbaninversion/shared';
import { resolveDeviceProfile, deviceProfileIdFromUrl } from '../device/device-profile.js';
import { PresenceClient } from './presence-client.js';
import { presenceStore } from './store.js';

/**
 * PresenceService: wires the DeviceProfile's providers to the PresenceClient
 * and publishes into the presence store for the ECS systems. Consent-gated:
 * nothing connects until consent(true) — the DOM pre-session page (which
 * also runs Turnstile) and the in-XR UIKitML consent panel both feed it.
 *
 * Holder export lets the UIKitML panel systems call the service without a
 * import cycle.
 */

const CONSENT_KEY = 'urbaninversion.consent';
const TOKEN_KEY = 'urbaninversion.turnstile';

/** @type {{ service: PresenceService | null }} */
export const presenceServiceHolder = { service: null };

export class PresenceService {
	/**
	 * @param {object} [options]
	 * @param {string} [options.profileId]
	 * @param {string} [options.apiBase] Defaults to same-origin.
	 * @param {string} [options.wsBase]
	 */
	constructor(options = {}) {
		this.profile = resolveDeviceProfile(options.profileId ?? deviceProfileIdFromUrl());
		this.apiBase = options.apiBase ?? '';
		this.wsBase = options.wsBase;
		/** @type {PresenceClient | null} */
		this.client = null;
		this.locationProvider = this.profile.createLocationProvider();
		this.headingProvider = this.profile.createHeadingProvider();
		/** @type {import('../device/providers/location-provider.js').LocationFix | null} */
		this.lastFix = null;
		this.consented = globalThis.sessionStorage?.getItem(CONSENT_KEY) === 'true';
		this.started = false;
	}

	/** @param {boolean} value */
	setConsent(value) {
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

	async start() {
		if (this.started || !this.consented) return;
		this.started = true;
		const cfg = await this.fetchConfig();
		const token = globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? undefined;
		this.client = new PresenceClient({
			cfg,
			wsBase: this.wsBase,
			turnstileToken: token,
			onEvent: (kind, detail) => this.onClientEvent(kind, detail),
		});
		await this.client.start();
		this.locationProvider.start(
			(fix) => void this.onFix(fix),
			(msg) => presenceStore.patchStatus({ locationError: msg })
		);
		presenceStore.patchStatus({ state: this.client.state, connected: true });
	}

	stop() {
		this.started = false;
		this.locationProvider.stop();
		this.client?.close();
		this.client = null;
		presenceStore.setMarkers([]);
		presenceStore.setAggregate(null);
		presenceStore.patchStatus({ connected: false });
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
	 * @param {import('../device/providers/location-provider.js').LocationFix} fix
	 */
	async onFix(fix) {
		const cameraPose = presenceStore.getCameraPose();
		this.headingProvider.update(
			cameraPose ? { x: cameraPose.x, z: cameraPose.z } : null,
			this.lastFix ? { lat: this.lastFix.lat, lon: this.lastFix.lon } : null,
			{ lat: fix.lat, lon: fix.lon },
			fix.tsMs
		);
		this.lastFix = fix;
		presenceStore.patchStatus({
			alignmentDeg: this.headingProvider.getOffsetDeg(),
			alignmentState: this.headingProvider.getState(),
			alignmentHint: this.headingProvider.getHint(),
			accuracyM: fix.accuracy,
		});
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
			case 'closed':
				presenceStore.patchStatus({ connected: false });
				break;
		}
	}
}

/** Called from src/index.js after World.create. @param {import('@iwsdk/core').World} _world */
export function bootstrapPresence(_world) {
	const service = new PresenceService();
	presenceServiceHolder.service = service;
	if (service.hasConsent()) void service.start();
	return service;
}
