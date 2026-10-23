import { createSystem, VisibilityState, findUIKitDocument } from '@iwsdk/core';
import { presenceServiceHolder } from '../presence/presence-service.js';

/**
 * PanelFlowSystem: exactly one UIKitML panel is ever visible, and none
 * outside the headset.
 *
 *  - 2D (non-immersive): the DOM overlay menu (src/dom-menu.js) — no
 *    spatial panel at all; browser text, native links.
 *  - Enter XR with no consent decision yet: the consent panel, centred.
 *  - Consent answered (either way): the presence panel — the in-XR home,
 *    which carries the Leave XR button.
 *
 * Panels are hidden with display:none on the document's root element (the
 * same setProperties API presence-ui uses for rows). A display:none root
 * collapses the UIKit layout, so hidden panels neither render nor catch
 * rays.
 */

/**
 * @typedef {'menu' | 'consent' | 'presence' | 'keyboard'} PanelStage
 */

/** @type {PanelStage} */
let stage = 'menu';

const PANEL_IDS = /** @type {const} */ (['consent-panel', 'presence-panel', 'keyboard-panel']);
const STAGE_PANELS = /** @type {Record<PanelStage, string[]>} */ ({
	// The 2D "menu" stage is the DOM overlay (src/dom-menu.js) — no
	// UIKitML panel is visible outside the headset.
	menu: [],
	consent: ['consent-panel'],
	presence: ['presence-panel'],
	keyboard: ['keyboard-panel'],
});
const CONSENT_KEY = 'urbaninversion.consent';

/**
 * Switch which panel is visible. Safe to call before the UIKitML assets
 * finish loading: documents without a root yet are skipped and
 * PanelFlowSystem.update applies the current stage once all are ready.
 *
 * @param {import('@iwsdk/core').World} world
 * @param {PanelStage} next
 * @returns {void}
 */
export function showStage(world, next) {
	stage = next;
	const visible = STAGE_PANELS[next];
	for (const id of PANEL_IDS) {
		const doc = findUIKitDocument(world.getSceneObject(id));
		doc?.rootElement?.setProperties({ display: visible.includes(id) ? 'flex' : 'none' });
	}
}

/** @returns {PanelStage} */
export function currentStage() {
	return stage;
}

/**
 * The consent panel is skipped only when a decision exists — including an
 * explicit "no": hasConsent() alone cannot distinguish denied from
 * never-asked, so the stored decision key is checked too.
 *
 * @returns {boolean}
 */
function consentDecided() {
	if (presenceServiceHolder.service?.hasConsent()) return true;
	return globalThis.sessionStorage?.getItem(CONSENT_KEY) != null;
}

export class PanelFlowSystem extends createSystem({}) {
	init() {
		this.applied = false;
		this.cleanupFuncs.push(
			this.world.visibilityState.subscribe((visibilityState) => {
				if (visibilityState === VisibilityState.NonImmersive) {
					showStage(this.world, 'menu');
				} else if (currentStage() === 'menu') {
					showStage(this.world, consentDecided() ? 'presence' : 'consent');
				}
			})
		);
	}

	update() {
		if (this.applied) return;
		// The scene's own default is all panels visible; collapse to the
		// current stage as soon as the flow-critical documents are loaded.
		// (The keyboard is optional here: a failed keyboard fetch must not
		// leave every panel stuck visible.)
		const ready = ['consent-panel', 'presence-panel'].every((id) =>
			findUIKitDocument(this.world.getSceneObject(id))?.rootElement != null
		);
		if (!ready) return;
		showStage(this.world, stage);
		this.applied = true;
	}
}
