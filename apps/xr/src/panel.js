/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';

// Site menu targets — the 2D panel doubles as the "main menu" back into
// the site (the XR bundle has no site chrome of its own).
const MENU = /** @type {const} */ ([
    ['menu-home', '/'],
    ['menu-how', '/how-it-works'],
    ['menu-privacy', '/privacy'],
]);

export class PanelSystem extends createSystem({}) {
    init() {
        const panel = this.world.getSceneObject('welcome-panel');
        const xrButton = panel?.getElementById('xr-button');
        const exitButton = panel?.getElementById('exit-button');
        if (xrButton == null || exitButton == null) {
            return;
        }
        for (const [id, href] of MENU) {
            const button = panel?.getElementById(id);
            if (button == null) continue;
            const navigate = () => {
                // Leaving the page ends the session cleanly (the socket
                // closes; the server keeps nothing).
                window.location.assign(href);
            };
            button.addEventListener('click', navigate);
            this.cleanupFuncs.push(() => button.removeEventListener('click', navigate));
        }
        if (!this.world.xrEnabled) {
            // No immersive mode on this device: the menu stays, the XR
            // enter/exit buttons do not apply.
            xrButton.setProperties({ display: 'none' });
            exitButton.setProperties({ display: 'none' });
            return;
        }
        const launchXR = () => this.world.launchXR();
        const exitXR = () => this.world.exitXR();
        xrButton.addEventListener('click', launchXR);
        exitButton.addEventListener('click', exitXR);
        this.cleanupFuncs.push(() => xrButton.removeEventListener('click', launchXR), () => exitButton.removeEventListener('click', exitXR), this.world.visibilityState.subscribe((visibilityState) => {
            const is2D = visibilityState === VisibilityState.NonImmersive;
            xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
            exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
        }));
    }
}
