// Verifies every locale defines exactly the same key set — a missing or
// stray key in one language is a bug (the store silently falls back).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'i18n', 'locales');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
	console.error('check-i18n: no locale files found');
	process.exit(1);
}

const dicts = Object.fromEntries(
	files.map((f) => {
		const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
		if (Array.isArray(parsed)) throw new Error(`${f}: expected object, got array`);
		return [f, new Set(Object.keys(parsed))];
	})
);

const base = files[0];
let bad = 0;
for (const f of files.slice(1)) {
	for (const key of dicts[base]) {
		if (!dicts[f].has(key)) {
			console.error(`missing in ${f}: ${key}`);
			bad++;
		}
	}
	for (const key of dicts[f]) {
		if (!dicts[base].has(key)) {
			console.error(`stray in ${f} (not in ${base}): ${key}`);
			bad++;
		}
	}
}
// Also check for empty values anywhere.
for (const f of files) {
	for (const [key, value] of Object.entries(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
		if (typeof value !== 'string' || value.trim() === '') {
			console.error(`empty value in ${f}: ${key}`);
			bad++;
		}
	}
}

if (bad > 0) {
	console.error(`check-i18n: ${bad} problem(s)`);
	process.exit(1);
}
console.log(`check-i18n: ${files.join(', ')} — ${dicts[base].size} keys in sync`);
