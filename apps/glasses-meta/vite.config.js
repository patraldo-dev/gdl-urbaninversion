import { defineConfig } from 'vite';

// Thin HUD adapter for Meta Ray-Ban Display web apps: plain HTML/JS/CSS,
// 600×600 additive-display-safe layout (dark bg, high contrast), D-pad
// (arrow-key + Enter) navigation. Built to dist/ and served at
// /glasses-meta/ by the web worker's static assets.
export default defineConfig({
	base: './',
	build: {
		outDir: 'dist',
		target: 'es2022',
	},
});
