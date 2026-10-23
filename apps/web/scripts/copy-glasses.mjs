import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copy the built glasses HUD adapter (apps/glasses-meta/dist) into
 * apps/web/static/glasses-meta so the web Worker serves it at
 * /glasses-meta/. Run `vite build` in apps/glasses-meta first.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(webRoot, 'static', 'glasses-meta');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(webRoot, '..', 'glasses-meta', 'dist'), target, { recursive: true });
console.log('copied apps/glasses-meta/dist -> apps/web/static/glasses-meta');
