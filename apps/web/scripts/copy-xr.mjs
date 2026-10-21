import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copy the built XR bundle (apps/xr/dist) into apps/web/static/xr so the
 * web Worker's static assets serve it at /xr. The XR build uses a relative
 * base (`base: './xr'`-agnostic), so no path rewriting is needed.
 * Run `npm run build -w @urbaninversion/xr` first.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(webRoot, 'static', 'xr');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(webRoot, '..', 'xr', 'dist'), target, { recursive: true });
console.log(`copied apps/xr/dist -> apps/web/static/xr`);
