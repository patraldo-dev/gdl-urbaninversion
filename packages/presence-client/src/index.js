export {
	markerIntents,
	aggregateIntent,
	describeMarker,
	speechForMarker,
	speechForAggregate,
} from '@urbaninversion/shared';
export { PresenceClient } from './client.js';
export { presenceStore } from './store.js';
export { PresenceService, bootstrapPresence, presenceServiceHolder } from './service.js';
export { BrowserGeolocationProvider, SimulatedLocationProvider } from './providers.js';
export { CompassHeadingProvider } from './heading.js';
export { resolveProfile, profileIdFromUrl, NoopHeadingProvider } from './profiles.js';
export {
	acquireWakeLock,
	releaseWakeLock,
	hasWakeLock,
	wakeLockSupported,
} from './wake-lock.js';
export {
	audioCuesEnabled,
	setAudioCuesEnabled,
	setAudioCuesLocale,
	speakCue,
	speechSupported,
	resetAudioCuesForTest,
} from './audio-cues.js';
