import { MENU_STRINGS } from './menu-strings.js';
import { locale } from './i18n.js';
import { VisibilityState } from '@iwsdk/core';
import { hapticPulse } from './ui/feedback.js';

/**
 * The 2D browser menu: real DOM over the canvas (the greenroom pattern —
 * all browser-page text is DOM where the font stack handles every glyph;
 * spatial UIKitML panels are reserved for the in-headset flow). Native
 * links mean native taps; no ray-hit subtleties on touch devices.
 *
 * The overlay hides itself while an XR session is active (the DOM is not
 * visible in-headset anyway) and returns on session end.
 */

/**
 * @param {import('@iwsdk/core').World} world
 * @returns {() => void} teardown
 */
export function createDomMenu(world) {
	const s = MENU_STRINGS[locale] ?? MENU_STRINGS.es;

	const root = document.createElement('nav');
	root.className = 'dom-menu';
	root.innerHTML = `
		<div class="dom-card">
			<h1>${s.brand}</h1>
			<p class="dom-pitch">${s.pitch}</p>
			<button type="button" class="dom-enter">${s.enter}</button>
			<p class="dom-noxr" hidden>${s.noXr}</p>
			<div class="dom-links">
				<a href="/">${s.home}</a>
				<a href="/how-it-works">${s.how}</a>
				<a href="/privacy">${s.privacy}</a>
			</div>
		</div>`;
	document.body.appendChild(root);

	const enter = /** @type {HTMLButtonElement} */ (root.querySelector('.dom-enter'));
	const noXr = /** @type {HTMLElement} */ (root.querySelector('.dom-noxr'));
	if (!world.xrEnabled) {
		enter.hidden = true;
		noXr.hidden = false;
	} else {
		enter.addEventListener('click', () => {
			hapticPulse(world);
			world.launchXR();
		});
	}

	const unsubscribe = world.visibilityState.subscribe((visibilityState) => {
		// The overlay is meaningless inside the headset.
		root.classList.toggle('hidden', visibilityState !== VisibilityState.NonImmersive);
	});

	return () => {
		unsubscribe();
		root.remove();
	};
}
