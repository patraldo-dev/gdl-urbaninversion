import { createSystem } from '@iwsdk/core';
import { showStage } from './panel-flow.js';
import { hapticPulse } from './feedback.js';

/**
 * KeyboardUiSystem: wires the surface keyboard panel.
 *
 * The keyboard is a world-space panel tilted like it lies on a desk; keys
 * respond to finger pokes (PokeInteractable), pinch/ray clicks, and mouse
 * in the 2D fallback. Typing updates the panel readout and the presence
 * panel's note row live: uikitml Text children recompute from the
 * container element's `text` property, so setProperties({text}) is the
 * only API used.
 *
 * The note is deliberately local: sessionStorage only, never sent to the
 * presence backend (the no-identity privacy posture is unchanged).
 */

const MAX_LEN = 80;
const NOTE_KEY = 'urbaninversion.note';

// letter keys are `key-<char>`; accented extras per locale
const CHAR_KEYS = {
	...Object.fromEntries('qwertyuiopasdfghjklzxcvbnm'.split('').map((ch) => [`key-${ch}`, ch])),
	'key-n-tilde': 'ñ',
	'key-e-acute': 'é',
	'key-a-grave': 'à',
	'key-c-cedilla': 'ç',
};

export class KeyboardUiSystem extends createSystem({}) {
	init() {
		this.wired = false;
		this.value = globalThis.sessionStorage?.getItem(NOTE_KEY) ?? '';
	}

	update() {
		if (this.wired) return;
		const panel = this.world.getSceneObject('keyboard-panel');
		const readout = panel?.getElementById('typed-text');
		const done = panel?.getElementById('key-done');
		if (readout == null || done == null) return; // UIKitML not loaded yet
		this.wired = true;

		const placeholder = readout.properties?.value?.text ?? '';

		const render = () => {
			readout.setProperties({ text: this.value === '' ? placeholder : this.value });
			const note = this.world
				.getSceneObject('presence-panel')
				?.getElementById('note-text');
			note?.setProperties({
				text: this.value,
				display: this.value === '' ? 'none' : 'flex',
			});
			try {
				globalThis.sessionStorage?.setItem(NOTE_KEY, this.value);
			} catch {
				// Private-mode storage can throw; the note just won't persist.
			}
		};

		/** @param {string} ch */
		const type = (ch) => {
			if (this.value.length >= MAX_LEN) return;
			this.value += ch;
			render();
		};
		const backspace = () => {
			this.value = this.value.slice(0, -1);
			render();
		};

		for (const [id, ch] of Object.entries(CHAR_KEYS)) {
			const button = panel?.getElementById(id);
			if (button == null) continue; // locale layouts differ
			const handler = () => {
				hapticPulse(this.world, 0.5, 40);
				type(ch);
			};
			button.addEventListener('click', handler);
			this.cleanupFuncs.push(() => button.removeEventListener('click', handler));
		}
		const space = panel?.getElementById('key-space');
		if (space != null) {
			const handler = () => {
				hapticPulse(this.world, 0.5, 40);
				type(' ');
			};
			space.addEventListener('click', handler);
			this.cleanupFuncs.push(() => space.removeEventListener('click', handler));
		}
		const backspaceButton = panel?.getElementById('key-backspace');
		if (backspaceButton != null) {
			const handler = () => {
				hapticPulse(this.world, 0.5, 40);
				backspace();
			};
			backspaceButton.addEventListener('click', handler);
			this.cleanupFuncs.push(() => backspaceButton.removeEventListener('click', handler));
		}
		const doneHandler = () => {
			hapticPulse(this.world);
			showStage(this.world, 'presence');
		};
		done.addEventListener('click', doneHandler);
		this.cleanupFuncs.push(() => done.removeEventListener('click', doneHandler));

		render();
	}
}
