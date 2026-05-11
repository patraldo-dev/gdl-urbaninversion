import { json } from '@sveltejs/kit';

/** Simple admin guard — Zero Trust handles real auth at the edge */
export async function load({ platform, url, cookies }) {
  // Check for admin session cookie
  const sessionToken = cookies.get('gdl_admin');
  const adminSecret = platform?.env?.ADMIN_SECRET;

  // If no secret configured, allow (Zero Trust only mode)
  if (!adminSecret) {
    const { results } = await platform.env.DB.prepare(`
      SELECT id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active
      FROM tour_anchors
      ORDER BY sort_order ASC, name ASC
    `).all();
    return { anchors: results || [], authenticated: true };
  }

  // Verify session
  if (sessionToken !== adminSecret) {
    return { anchors: [], authenticated: false };
  }

  const { results } = await platform.env.DB.prepare(`
    SELECT id, name, description, lat, lng, year, narrator, type, image_url, audio_url, sort_order, active
    FROM tour_anchors
    ORDER BY sort_order ASC, name ASC
  `).all();

  return { anchors: results || [], authenticated: true };
}
