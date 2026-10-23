/**
 * Drift-tolerant tap handling for UIKitML buttons.
 *
 * The pointer-events library only synthesizes 'click' when the down-ray
 * and up-ray hit the *same object*. A uikit Button is a subtree (container
 * panel + icon + label meshes): real fingers drift a few px between down
 * and up, the two rays land on different children, and the click never
 * fires — buttons felt dead on phones while pixel-clean emulator taps
 * worked. pointerdown/pointerup both bubble to the Button element from
 * any child, so pairing them here restores taps; a release outside the
 * button never reaches this element, so the pairing cannot over-fire.
 */

/**
 * @typedef {object} TapElement
 * @property {addEventListener: (type: string, fn: () => void) => void}
 * @property {removeEventListener: (type: string, fn: () => void) => void}
 */

/**
 * @param {TapElement} element
 * @param {() => void} handler
 * @returns {() => void} cleanup
 */
export function onTap(element, handler) {
	let downAt = 0;
	const onDown = () => {
		downAt = Date.now();
	};
	const onUp = () => {
		if (downAt > 0 && Date.now() - downAt < 600) {
			downAt = 0;
			handler();
		}
	};
	element.addEventListener('pointerdown', onDown);
	element.addEventListener('pointerup', onUp);
	return () => {
		element.removeEventListener('pointerdown', onDown);
		element.removeEventListener('pointerup', onUp);
	};
}
