/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AssetType, defineAssets } from '@iwsdk/core';
const publicAssetUrl = (filePath) => `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const DEFAULT_STOCK_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets';
const configuredStockAssetBase = import.meta.env.VITE_IWSDK_EXAMPLE_ASSET_BASE_URL?.trim();
const stockAssetBase = (configuredStockAssetBase || DEFAULT_STOCK_ASSET_BASE).replace(/\/+$/u, '');
function stockAssetUrl(assetId, fileName) {
    return `${stockAssetBase}/${assetId}/${fileName}`;
}
export default defineAssets({
    'welcome-panel': {
        url: publicAssetUrl('ui/welcome.uikitml'),
        type: AssetType.UIKitML,
        name: 'Welcome Panel',
    },
    'presence-panel': {
        url: publicAssetUrl('ui/presence-panel.uikitml'),
        type: AssetType.UIKitML,
        name: 'Presence Panel',
    },
    'consent-panel': {
        url: publicAssetUrl('ui/consent-panel.uikitml'),
        type: AssetType.UIKitML,
        name: 'Consent Panel',
    },
});
