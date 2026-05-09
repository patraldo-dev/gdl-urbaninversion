// src/lib/types.d.ts
// JSDoc type definitions for GDL Urban Inversion

/**
 * @typedef {Object} PuntoInteres
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Historical description
 * @property {string} narrator - Character who narrates at this point
 * @property {number} lat - Latitude (GDL area: ~20.67)
 * @property {number} lon - Longitude (GDL area: ~-103.38)
 * @property {number} year - Historical year
 * @property {'observatory'|'institute'|'memorial'|'gallery'} type - Point type
 * @property {string} [audioKey] - Key for audio in R2/narrator API
 */

/**
 * @typedef {Object} Narration
 * @property {string} id
 * @property {string} anchor_id - References PuntoInteres.id
 * @property {string} scene - Scene key (welcome, observatory, weather, stars, etc.)
 * @property {string} text - Narration text
 * @property {string} voice - Voice identifier
 * @property {number} epoch - Historical era (e.g. 1920)
 */

/**
 * @typedef {Object} Visit
 * @property {string} id
 * @property {string} anchor_id
 * @property {string} [visitor_id]
 * @property {string} scene
 * @property {number} duration_seconds
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string} visited_at
 */

export {};
