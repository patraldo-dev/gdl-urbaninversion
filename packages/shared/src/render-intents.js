/**
 * Render-intent layer: pure functions converting privacy-safe proximity
 * facts (MarkerEntry buckets / aggregate counts) into device-neutral output
 * intents. No worker or server code renders anything device-specific —
 * clients pick the intents their DeviceProfile can show.
 *
 * Numbers stay bucketed end-to-end: distance text reconstructs approximate
 * meters from the bucket midpoint, never a raw value. Directions convert
 * the absolute me→them bearing into a body-relative sector using the
 * CLIENT's heading (compass or GPS course); without a heading the direction
 * is 'unknown' — we never invent one.
 */

/**
 * @typedef {'very-close' | 'close' | 'nearby' | 'far'} DistanceTier
 * @typedef {'ahead' | 'ahead-left' | 'ahead-right' | 'left' | 'right' | 'behind' | 'behind-left' | 'behind-right' | 'unknown'} DirectionSector
 */

/**
 * @typedef {object} RenderIntent
 * @property {'text_line' | 'speech' | 'arrow' | 'ambient_summary'} kind
 * @property {number} priority Smaller = more urgent.
 * @property {string} text For text_line / speech / ambient_summary.
 * @property {number} [angleDegrees] For arrow: body-relative clockwise, 0 = ahead.
 */

/** @typedef {{ open: number, quiet: number }} AggregateCounts */

const TIERS = /** @type {const} */ ([
	['very-close', 10],
	['close', 25],
	['nearby', 50],
]);

/**
 * @param {number} meters
 * @returns {DistanceTier}
 */
export function distanceTier(meters) {
	for (const [tier, max] of TIERS) if (meters <= max) return /** @type {DistanceTier} */ (tier);
	return 'far';
}

/**
 * @param {number} relativeDeg Clockwise, 0 = facing ahead.
 * @returns {DirectionSector}
 */
export function directionSector(relativeDeg) {
	const a = ((relativeDeg % 360) + 360) % 360;
	const sector = Math.round(a / 45) % 8;
	/** @type {DirectionSector[]} */
	const names = [
		'ahead',
		'ahead-right',
		'right',
		'behind-right',
		'behind',
		'behind-left',
		'left',
		'ahead-left',
	];
	return names[sector] ?? 'ahead';
}

/**
 * @typedef {object} IntentLocale
 * @property {Record<'open' | 'quiet', string>} states
 * @property {Record<DistanceTier, string>} tiers
 * @property {Record<DirectionSector, string>} directions
 * @property {(m: number) => string} meters
 * @property {(state: 'open' | 'quiet', n: number) => string} person
 * @property {(open: number, quiet: number) => string} summary
 */

/** @type {Record<string, IntentLocale>} */
const LOCALES = {
	en: {
		states: { open: 'Open', quiet: 'Quiet' },
		tiers: { 'very-close': 'very close', close: 'close', nearby: 'nearby', far: 'far' },
		directions: {
			ahead: 'ahead',
			'ahead-left': 'ahead left',
			'ahead-right': 'ahead right',
			left: 'to your left',
			right: 'to your right',
			behind: 'behind you',
			'behind-left': 'behind left',
			'behind-right': 'behind right',
			unknown: 'direction unknown',
		},
		meters: (m) => `${m} m`,
		person: (state, n) => `${n} ${n === 1 ? 'person' : 'people'} ${state === 'open' ? 'open' : 'quiet'}`,
		summary: (open, quiet) =>
			`Nearby: ${open} ${open === 1 ? 'person' : 'people'} open, ${quiet} ${quiet === 1 ? 'person' : 'people'} quiet`,
	},
	es: {
		states: { open: 'Abierto', quiet: 'Tranquilo' },
		tiers: { 'very-close': 'muy cerca', close: 'cerca', nearby: 'cercano', far: 'lejos' },
		directions: {
			ahead: 'delante',
			'ahead-left': 'delante a la izquierda',
			'ahead-right': 'delante a la derecha',
			left: 'a tu izquierda',
			right: 'a tu derecha',
			behind: 'detrás',
			'behind-left': 'detrás a la izquierda',
			'behind-right': 'detrás a la derecha',
			unknown: 'dirección desconocida',
		},
		meters: (m) => `${m} m`,
		person: (state, n) =>
			`${n} ${n === 1 ? 'persona' : 'personas'} ${state === 'open' ? 'abierta' : 'tranquila'}${n === 1 ? '' : 's'}`,
		summary: (open, quiet) =>
			`Cerca: ${open} ${open === 1 ? 'persona abierta' : 'personas abiertas'}, ${quiet} ${quiet === 1 ? 'persona tranquila' : 'personas tranquilas'}`,
	},
	fr: {
		states: { open: 'Ouvert', quiet: 'Calme' },
		tiers: { 'very-close': 'très proche', close: 'proche', nearby: 'à proximité', far: 'loin' },
		directions: {
			ahead: 'devant',
			'ahead-left': 'devant à gauche',
			'ahead-right': 'devant à droite',
			left: 'à gauche',
			right: 'à droite',
			behind: 'derrière',
			'behind-left': 'derrière à gauche',
			'behind-right': 'derrière à droite',
			unknown: 'direction inconnue',
		},
		meters: (m) => `${m} m`,
		person: (state, n) =>
			`${n} ${n === 1 ? 'personne' : 'personnes'} ${state === 'open' ? 'ouverte' : 'calme'}${n === 1 ? '' : 's'}`,
		summary: (open, quiet) =>
			`À proximité : ${open} ${open === 1 ? 'personne ouverte' : 'personnes ouvertes'}, ${quiet} ${quiet === 1 ? 'personne calme' : 'personnes calmes'}`,
	},
};

/** @param {string} locale @returns {IntentLocale} */
function dict(locale) {
	return LOCALES[locale.split('-')[0] ?? locale] ?? /** @type {IntentLocale} */ (LOCALES.en);
}

/**
 * Human description of one nearby person. All values stay bucketed.
 *
 * @param {import('./types.js').MarkerEntry} marker
 * @param {{ distanceBucketM: number, bearingBucketDeg: number }} geometry From hello-ack cfg.
 * @param {number | null} headingDeg The receiving client's absolute heading, or null.
 * @param {string} locale
 */
export function describeMarker(marker, geometry, headingDeg, locale) {
	const L = dict(locale);
	const meters = Math.max(1, Math.round((marker.dist + 0.5) * geometry.distanceBucketM));
	const absoluteBearing = marker.brng * geometry.bearingBucketDeg;
	const relativeDeg =
		headingDeg == null ? null : (((absoluteBearing - headingDeg) % 360) + 360) % 360;
	const sector = /** @type {DirectionSector} */ (relativeDeg == null ? 'unknown' : directionSector(relativeDeg));
	return {
		handle: marker.handle,
		state: marker.state,
		stateLabel: L.states[marker.state],
		meters,
		metersText: L.meters(meters),
		tier: distanceTier(meters),
		tierLabel: L.tiers[distanceTier(meters)],
		relativeDeg,
		sector: /** @type {DirectionSector} */ (sector),
		directionLabel: L.directions[sector],
		line: `${L.states[marker.state]} · ${L.meters(meters)} · ${L.directions[sector]}`,
	};
}

/**
 * Glanceable text intents for a marker set, nearest first. Closer markers
 * get more urgent (lower) priority numbers.
 *
 * @param {import('./types.js').MarkerEntry[]} markers
 * @param {{ distanceBucketM: number, bearingBucketDeg: number }} geometry
 * @param {number | null} headingDeg
 * @param {string} locale
 * @returns {RenderIntent[]}
 */
export function markerIntents(markers, geometry, headingDeg, locale) {
	const described = markers
		.map((m) => describeMarker(m, geometry, headingDeg, locale))
		.sort((a, b) => a.meters - b.meters);
	const out = /** @type {RenderIntent[]} */ ([]);
	for (const d of described) {
		const priority = Math.max(1, Math.min(99, Math.round(d.meters / 2)));
		out.push({ kind: 'text_line', priority, text: d.line });
		if (d.relativeDeg != null) {
			out.push({ kind: 'arrow', priority, angleDegrees: d.relativeDeg, text: d.stateLabel });
		}
	}
	return out;
}

/**
 * Aggregate summary intent for OBSERVER / coarse clients.
 *
 * @param {AggregateCounts} counts
 * @param {string} locale
 * @returns {RenderIntent}
 */
export function aggregateIntent(counts, locale) {
	return {
		kind: 'ambient_summary',
		priority: 50,
		text: dict(locale).summary(counts.open, counts.quiet),
	};
}

/**
 * Spoken cue for one described person (audio glasses / headphones).
 *
 * @param {ReturnType<typeof describeMarker>} d
 * @param {string} locale
 * @returns {RenderIntent}
 */
export function speechForMarker(d, locale) {
	// Same content as the text line; speech synthesis handles reading it.
	return { kind: 'speech', priority: Math.max(1, Math.min(99, Math.round(d.meters / 2))), text: d.line };
}

/**
 * Spoken summary of the aggregate (for coarse/observer audio clients).
 *
 * @param {AggregateCounts} counts
 * @param {string} locale
 * @returns {RenderIntent}
 */
export function speechForAggregate(counts, locale) {
	return { kind: 'speech', priority: 50, text: dict(locale).summary(counts.open, counts.quiet) };
}

/**
 * Roster intents for place rooms: no distance, no bearing — everyone is
 * here. One line per visible member ("Open", "Quiet"), join order.
 *
 * @param {import('./types.js').MarkerEntry[]} markers
 * @param {string} locale
 * @returns {RenderIntent[]}
 */
export function rosterIntents(markers, locale) {
	const L = dict(locale);
	return markers.map((m) => ({
		kind: /** @type {'text_line'} */ ('text_line'),
		priority: 50,
		text: L.states[m.state],
	}));
}
