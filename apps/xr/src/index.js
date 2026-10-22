/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { PanelFlowSystem } from './ui/panel-flow.js';
import { SpatialDiscoverySystem } from './ecs/spatial-discovery-system.js';
import { PresenceUiSystem } from './ui/presence-ui.js';
import { bootstrapPresence } from './presence/presence-service.js';
World.create(document.getElementById('scene-container'), projectOptions).then((world) => {
    world.registerSystem(PanelFlowSystem);
    world.registerSystem(SpatialDiscoverySystem);
    world.registerSystem(PresenceUiSystem);
    world.registerSystem(PanelSystem);
    bootstrapPresence(world);
});
