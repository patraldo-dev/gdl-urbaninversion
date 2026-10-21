import { createSystem, VisibilityState } from '@iwsdk/core';
import { presenceServiceHolder } from '../presence/presence-service.js';
import { presenceStore } from '../presence/store.js';

/**
 * PresenceUiSystem: the in-XR UIKitML surfaces.
 *  - consent-panel: explicit opt-in before any location sharing (shown
 *    first; the pre-session DOM page carries Turnstile — Phase 1
 *    correction 4 — while the in-XR opt-in happens here).
 *  - presence-panel: the state toggle (OPEN / QUIET / OBSERVER / INVISIBLE)
 *    plus status rows toggled via display (only setProperties APIs that the
 *    scaffold itself uses — no text-update API assumed).
 */
export class PresenceUiSystem extends createSystem({}) {
	init() {
		const consent = this.world.getSceneObject('consent-panel');
		const allow = consent?.getElementById('consent-allow');
		const deny = consent?.getElementById('consent-deny');
		const panel = this.world.getSceneObject('presence-panel');
		const open = panel?.getElementById('state-open');
		const quiet = panel?.getElementById('state-quiet');
		const observer = panel?.getElementById('state-observer');
		const invisible = panel?.getElementById('state-invisible');
		const service = presenceServiceHolder.service;

		const showConsent = (visible) => {
			consent?.getElementById('consent-allow')?.setProperties({ display: visible ? 'flex' : 'none' });
			consent?.getElementById('consent-deny')?.setProperties({ display: visible ? 'flex' : 'none' });
		};

		if (allow && deny && service) {
			allow.addEventListener('click', () => {
				service.setConsent(true);
				showConsent(false);
			});
			deny.addEventListener('click', () => {
				service.setConsent(false);
				showConsent(false);
			});
			showConsent(!service.hasConsent());
			this.cleanupFuncs.push(
				() => allow.removeEventListener('click', () => {}),
				() => deny.removeEventListener('click', () => {})
			);
		}

		const bind = (el, state) => {
			if (!el || !service) return;
			const handler = () => void service.setState(state);
			el.addEventListener('click', handler);
			this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
		};
		bind(open, 'open');
		bind(quiet, 'quiet');
		bind(observer, 'observer');
		bind(invisible, 'invisible');
	}

	update() {
		const panel = this.world.getSceneObject('presence-panel');
		if (!panel) return;
		const status = presenceStore.getStatus();
		const rows = [
			['status-coarse', status.coarse],
			['status-align', status.alignmentState !== 'locked' && status.state !== 'observer'],
			['status-location-error', status.locationError !== ''],
			['status-offline', !status.connected],
		];
		for (const [id, visible] of rows) {
			panel.getElementById(id)?.setProperties({ display: visible ? 'flex' : 'none' });
		}
		const aggregate = presenceStore.getAggregate();
		panel.getElementById('status-aggregate')?.setProperties({
			display: aggregate && (status.coarse || status.state === 'observer') ? 'flex' : 'none',
		});
	}
}
