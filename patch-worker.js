#!/usr/bin/env node
// Post-build patch: replace Workers Sites (KV) with Workers Static Assets
// adapter-cloudflare-workers generates KV-based code; wrangler 4 removed KV asset support
// This patches worker.js to use env.ASSETS.fetch() instead

import { readFileSync, writeFileSync } from 'fs';

const workerPath = '.cloudflare/worker.js';
let code = readFileSync(workerPath, 'utf-8');

// Remove the __STATIC_CONTENT_MANIFEST import (causes "No such module" error)
code = code.replace(
  /import static_asset_manifest_json from "__STATIC_CONTENT_MANIFEST";\n/,
  ''
);

// Replace static_asset_manifest parsing with empty object
code = code.replace(
  /var static_asset_manifest = JSON\.parse\(static_asset_manifest_json\);/,
  'var static_asset_manifest = {};'
);

// Replace get_asset_from_kv function to use env.ASSETS.fetch()
code = code.replace(
  /async function get_asset_from_kv\(req, env, context2, map = import_kv_asset_handler\.mapRequestToAsset\) \{[\s\S]*?function is_error\(status\) \{/,
  `async function get_asset_from_kv(req, env, context2, map) {
  // Use Workers Static Assets binding instead of KV
  const url = new URL(req.url);
  const assetReq = new Request(url.toString(), req);
  try {
    const res = await env.ASSETS.fetch(assetReq);
    if (res.status === 404) throw new Error('Not found');
    return res;
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
function is_error(status) {`
);

writeFileSync(workerPath, code);
console.log('✅ Patched worker.js: KV → Workers Static Assets (env.ASSETS)');
