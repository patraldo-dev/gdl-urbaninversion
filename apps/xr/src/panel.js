/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import { hapticPulse } from './ui/feedback.js';
import { onTap } from './ui/tap.js';

// Site menu targets — the 2D panel doubles as the "main menu" back into
// the site (the XR bundle has no site chrome of its own).
const MENU = /** @type {const} */ ([
    ['menu-home', '/'],
    ['menu-how', '/how-it-works'],
    ['menu-privacy', '/privacy'],
]);

export class PanelSystem extends createSystem({}) {
    init() {
        // UIKitML assets load asynchronously, so element lookups can fail
        // at init time; wiring is retried in update() until the panel's
        // elements exist (same pattern as src/ui/presence-ui.js).
        this.wired = false;
    }

    update() {
        if (this.wired) return;
        const panel = this.world.getSceneObject('welcome-panel');
        const xrButton = panel?.getElementById('xr-button');
        const exitButton = panel?.getElementById('exit-button');
        if (xrButton == null || exitButton == null) {
            return;
        }
        this.wired = true;
        for (const [id, href] of MENU) {
            const button = panel?.getElementById(id);
            if (button == null) continue;
            const navigate = () => {
                hapticPulse(this.world);
                // Leaving the page ends the session cleanly (the socket
                // closes; the server keeps nothing).
                window.location.assign(href);
            };
            this.cleanupFuncs.push(onTap(button, navigate));
        }
        if (!this.world.xrEnabled) {
            // No immersive mode on this device: the menu stays, the XR
            // enter/exit buttons do not apply.
            xrButton.setProperties({ display: 'none' });
            exitButton.setProperties({ display: 'none' });
            return;
        }
        const launchXR = () => {
            hapticPulse(this.world);
            this.world.launchXR();
        };
        const exitXR = () => {
            hapticPulse(this.world);
            this.world.exitXR();
        };
        this.cleanupFuncs.push(onTap(/** @type {object} */ (xrButton), launchXR), onTap(/** @type {object} */ (exitButton), exitXR), this.world.visibilityState.subscribe((visibilityState) => {
            const is2D = visibilityState === VisibilityState.NonImmersive;
            xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
            exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
        }));
    }
}
