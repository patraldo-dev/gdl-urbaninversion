import { Types, createComponent } from '@iwsdk/core';

/**
 * Runtime ECS components for the presence layer. Declared in JS with plain
 * enum maps (Types.Enum requires an enum map — the shared package's string
 * unions are wire types, not enum objects).
 */

/** Enum map for wire presence states (values match packages/shared types). */
export const PresenceStateEnum = {
	OPEN: 'open',
	QUIET: 'quiet',
	OBSERVER: 'observer',
	INVISIBLE: 'invisible',
};

/**
 * The local user's presence state. OBSERVER renders no individual markers
 * (aggregates only); INVISIBLE means the client holds no sockets at all.
 */
export const Presence = createComponent('Presence', {
	state: { type: Types.Enum, enum: PresenceStateEnum, default: PresenceStateEnum.OBSERVER },
	expiresAt: { type: Types.Float64, default: 0 },
});

/** Enum map for marker states (only visible states exist here). */
const MarkerStateEnum = { OPEN: 'open', QUIET: 'quiet' };

/**
 * One nearby person. distBucket/brngBucket are the quantized indices from
 * the server — never raw meters or degrees (see packages/shared geo/quantize).
 */
export const Marker = createComponent('Marker', {
	handle: { type: Types.String, default: '' },
	state: { type: Types.Enum, enum: MarkerStateEnum, default: MarkerStateEnum.OPEN },
	distBucket: { type: Types.Int32, default: 0 },
	brngBucket: { type: Types.Int32, default: 0 },
	updatedAt: { type: Types.Float64, default: 0 },
});
