import { createSystem, VisibilityState } from '@iwsdk/core';
import { presenceServiceHolder } from '../presence/presence-service.js';
import { presenceStore } from '../presence/store.js';
import { showStage } from './panel-flow.js';
import { hapticPulse } from './feedback.js';

/**
 * PresenceUiSystem: wires the in-XR UIKitML surfaces.
 *  - consent-panel: explicit opt-in before any location sharing (the
 *    pre-session DOM page carries Turnstile; the in-XR opt-in happens
 *    here). Either answer advances the flow to the presence panel.
 *  - presence-panel: the state toggle (OPEN / QUIET / OBSERVER /
 *    INVISIBLE), status rows toggled via display (only setProperties
 *    APIs the scaffold itself uses — no text-update API is assumed), and
 *    Leave XR.
 *
 * Whole-panel visibility is owned by PanelFlowSystem; this system only
 * wires buttons and status rows. Wiring is retried in update() because
 * the UIKitML documents load asynchronously.
 */
export class PresenceUiSystem extends createSystem({}) {
	init() {
		this.wired = false;
	}

	update() {
		if (this.wired) {
			this.updateStatusRows();
			return;
		}
		const consent = this.world.getSceneObject('consent-panel');
		const allow = consent?.getElementById('consent-allow');
		const deny = consent?.getElementById('consent-deny');
		const panel = this.world.getSceneObject('presence-panel');
		const open = panel?.getElementById('state-open');
		const quiet = panel?.getElementById('state-quiet');
		const observer = panel?.getElementById('state-observer');
		const invisible = panel?.getElementById('state-invisible');
		const exit = panel?.getElementById('exit-xr');
		const service = presenceServiceHolder.service;
		if (allow == null || deny == null || service == null) return;
		if (open == null || quiet == null || observer == null || invisible == null) return;
		this.wired = true;

		const allowHandler = () => {
			hapticPulse(this.world);
			service.setConsent(true);
			showStage(this.world, 'presence');
		};
		const denyHandler = () => {
			hapticPulse(this.world);
			service.setConsent(false);
			showStage(this.world, 'presence');
		};
		allow.addEventListener('click', allowHandler);
		deny.addEventListener('click', denyHandler);
		this.cleanupFuncs.push(
			() => allow.removeEventListener('click', allowHandler),
			() => deny.removeEventListener('click', denyHandler)
		);

		/** @param {object} el @param {() => void} handler */
		const bind = (el, handler) => {
			const onClick = () => {
				hapticPulse(this.world);
				handler();
			};
			el.addEventListener('click', onClick);
			this.cleanupFuncs.push(() => el.removeEventListener('click', onClick));
		};
		bind(open, () => void service.setState('open'));
		bind(quiet, () => void service.setState('quiet'));
		bind(observer, () => void service.setState('observer'));
		bind(invisible, () => void service.setState('invisible'));

		if (exit != null) {
			bind(exit, () => {
				if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
					this.world.exitXR();
				}
			});
		}
		const keyboard = panel?.getElementById('open-keyboard');
		if (keyboard != null) {
			bind(keyboard, () => showStage(this.world, 'keyboard'));
		}
	}

	updateStatusRows() {
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
