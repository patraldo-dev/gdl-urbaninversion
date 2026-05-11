import { json } from '@sveltejs/kit';

/**
 * GET /api/anchors — public endpoint for the tour map
 * Returns only active anchors, ordered by sort_order
 */
export async function GET({ platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No database' }, { status: 500 });

  const { results } = await db.prepare(`
    SELECT id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order
    FROM tour_anchors
    WHERE active = 1
    ORDER BY sort_order ASC, year ASC
  `).all();

  return json({ anchors: results || [] });
}
