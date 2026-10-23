import { afterEach, describe, expect, it, vi } from 'vitest';
import { presenceStore } from '../src/store.js';
import {
	audioCuesEnabled,
	setAudioCuesEnabled,
	setAudioCuesLocale,
	speakCue,
	resetAudioCuesForTest,
} from '../src/audio-cues.js';

describe('presenceStore', () => {
	afterEach(() => {
		presenceStore.setMarkers([]);
		presenceStore.setAggregate(null);
		presenceStore.patchStatus({ connected: false });
	});

	it('notifies subscribers on every mutation', () => {
		let fired = 0;
		const off = presenceStore.subscribe(() => {
			fired++;
		});
		presenceStore.setMarkers([{ handle: 'h', state: 'open', dist: 0, brng: 0 }]);
		presenceStore.setAggregate({ open: 1, quiet: 0 });
		presenceStore.patchStatus({ connected: true });
		expect(fired).toBe(3);
		expect(presenceStore.getMarkers()).toHaveLength(1);
		expect(presenceStore.getAggregate()).toEqual({ open: 1, quiet: 0 });
		expect(presenceStore.getStatus().connected).toBe(true);
		off();
		presenceStore.patchStatus({ connected: false });
		expect(fired).toBe(3);
	});
});

describe('audio cues', () => {
	const store = new Map();
	vi.stubGlobal('localStorage', {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, v),
	});

	afterEach(() => {
		resetAudioCuesForTest();
		setAudioCuesEnabled(false);
		vi.restoreAllMocks();
	});

	it('stays silent unless opted in', () => {
		setAudioCuesEnabled(false);
		const speak = vi.fn();
		vi.stubGlobal('speechSynthesis', { speak, cancel() {} });
		vi.stubGlobal(
			'SpeechSynthesisUtterance',
			class {
				constructor(text) {
					this.text = text;
				}
			}
		);
		speakCue('Open · 15 m · ahead');
		expect(speak).not.toHaveBeenCalled();
	});

	it('speaks after opt-in and rate-limits with newest-wins queueing', () => {
		vi.useFakeTimers();
		setAudioCuesEnabled(true);
		expect(audioCuesEnabled()).toBe(true);
		setAudioCuesLocale('es');
		const spoken = [];
		vi.stubGlobal('speechSynthesis', { speak: (u) => spoken.push(u.text), cancel() {} });
		vi.stubGlobal(
			'SpeechSynthesisUtterance',
			class {
				constructor(text) {
					this.text = text;
				}
			}
		);
		speakCue('first');
		expect(spoken).toEqual(['first']);
		speakCue('second');
		speakCue('third'); // replaces 'second' — newest wins
		expect(spoken).toEqual(['first']); // still cooling down
		vi.advanceTimersByTime(8_500);
		expect(spoken).toEqual(['first', 'third']); // only the newest queued cue plays
	});
});
