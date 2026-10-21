import { json } from '@sveltejs/kit';

/**
 * GET  /api/admin/anchors — list all anchors (admin)
 * POST /api/admin/anchors — create anchor
 * PUT  /api/admin/anchors — update anchor
 * DELETE /api/admin/anchors?id= — delete anchor
 */
export async function GET({ platform, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No database' }, { status: 500 });

  const { results } = await db.prepare(`
    SELECT id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active, created_at, updated_at
    FROM tour_anchors
    ORDER BY sort_order ASC, name ASC
  `).all();

  return json({ anchors: results || [] });
}

export async function POST({ request, platform, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No database' }, { status: 500 });

  try {
    const { id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active } = await request.json();

    if (!id || !name || lat == null || lng == null) {
      return json({ error: 'id, name, lat, lng required' }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);

    await db.prepare(`
      INSERT INTO tour_anchors (id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, description || '', lat, lng,
      year || 0, narrator || '', type || 'observatory',
      image_url || '', audio_url || '',
      sort_order || 0, active !== false ? 1 : 0, now, now
    ).run();

    return json({ success: true, id });
  } catch (e) {
    console.error('anchors create error:', e);
    return json({ error: 'Create failed' }, { status: 500 });
  }
}

export async function PUT({ request, platform, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No database' }, { status: 500 });

  try {
    const { id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active } = await request.json();

    if (!id) return json({ error: 'id required' }, { status: 400 });

    const now = Math.floor(Date.now() / 1000);

    await db.prepare(`
      UPDATE tour_anchors
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          lat = COALESCE(?, lat),
          lng = COALESCE(?, lng),
          year = COALESCE(?, year),
          narrator = COALESCE(?, narrator),
          type = COALESCE(?, type),
          image_url = COALESCE(?, image_url),
          audio_url = COALESCE(?, audio_url),
          sort_order = COALESCE(?, sort_order),
          active = COALESCE(?, active),
          updated_at = ?
      WHERE id = ?
    `).bind(name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active, now, id).run();

    return json({ success: true });
  } catch (e) {
    console.error('anchors update error:', e);
    return json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE({ url, platform, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No database' }, { status: 500 });

  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, { status: 400 });

  await db.prepare('DELETE FROM tour_anchors WHERE id = ?').bind(id).run();

  return json({ success: true });
}
