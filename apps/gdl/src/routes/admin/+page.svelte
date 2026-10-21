<!-- src/routes/admin/+page.svelte -->
<script>
  let { data } = $props();
  let anchors = $state(data.anchors || []);
  let message = $state('');
  let messageError = $state(false);
  let editingId = $state(null);

  let newAnchor = $state({
    id: '',
    name: '',
    description: '',
    lat: '',
    lng: '',
    year: '',
    narrator: '',
    type: 'observatory',
    sort_order: 0,
  });

  let editData = $state({});

  function showMsg(text, isError = false) {
    message = text;
    messageError = isError;
    setTimeout(() => { message = ''; }, 4000);
  }

  async function addAnchor() {
    if (!newAnchor.id || !newAnchor.name || !newAnchor.lat || !newAnchor.lng) {
      showMsg('ID, name, lat, lng required', true);
      return;
    }
    try {
      const res = await fetch('/api/admin/anchors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAnchor,
          lat: parseFloat(newAnchor.lat),
          lng: parseFloat(newAnchor.lng),
          year: parseInt(newAnchor.year) || 0,
          sort_order: parseInt(newAnchor.sort_order) || 0,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        showMsg(`"${newAnchor.name}" added`);
        newAnchor = { id: '', name: '', description: '', lat: '', lng: '', year: '', narrator: '', type: 'observatory', sort_order: 0 };
        await reload();
      } else {
        showMsg(d.error || 'Failed', true);
      }
    } catch {
      showMsg('Network error', true);
    }
  }

  async function saveEdit() {
    try {
      const res = await fetch('/api/admin/anchors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          ...editData,
          lat: parseFloat(editData.lat),
          lng: parseFloat(editData.lng),
          year: parseInt(editData.year) || 0,
          sort_order: parseInt(editData.sort_order) || 0,
          active: editData.active ? 1 : 0,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        showMsg('Updated');
        editingId = null;
        await reload();
      } else {
        showMsg(d.error || 'Failed', true);
      }
    } catch {
      showMsg('Network error', true);
    }
  }

  async function deleteAnchor(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/anchors?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMsg(`"${name}" deleted`);
        await reload();
      }
    } catch {
      showMsg('Network error', true);
    }
  }

  async function toggleActive(anchor) {
    await fetch('/api/admin/anchors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: anchor.id, active: anchor.active ? 0 : 1 }),
    });
    await reload();
  }

  function startEdit(anchor) {
    editingId = anchor.id;
    editData = {
      name: anchor.name,
      description: anchor.description || '',
      lat: anchor.lat,
      lng: anchor.lng,
      year: anchor.year || '',
      narrator: anchor.narrator || '',
      type: anchor.type || 'observatory',
      image_url: anchor.image_url || '',
      audio_url: anchor.audio_url || '',
      sort_order: anchor.sort_order || 0,
      active: anchor.active,
    };
  }

  async function reload() {
    const res = await fetch('/api/admin/anchors');
    if (res.ok) {
      const d = await res.json();
      anchors = d.anchors || [];
    }
  }

  const types = ['observatory', 'institute', 'memorial', 'landmark', 'church', 'plaza', 'museum', 'other'];
</script>

<svelte:head>
  <title>Astronomy Tour Anchors — Admin</title>
</svelte:head>

<div class="admin-container">
  <header class="page-header">
    <h1>🔭 Astronomy Tour Anchors</h1>
    <p class="subtitle">Manage GDL astronomy tour coordinates for urbaninversion.com</p>
  </header>

  {#if message}
    <div class="message" class:error={messageError}>{message}</div>
  {/if}

  <!-- Add new -->
  <section class="add-section">
    <h2>+ Add Anchor</h2>
    <div class="form-grid">
      <div class="field"><label>ID (slug)</label><input type="text" bind:value={newAnchor.id} placeholder="colegio-san-juan"></div>
      <div class="field"><label>Name</label><input type="text" bind:value={newAnchor.name} placeholder="Antiguo Colegio..."></div>
      <div class="field"><label>Latitude</label><input type="number" step="any" bind:value={newAnchor.lat} placeholder="20.6775"></div>
      <div class="field"><label>Longitude</label><input type="number" step="any" bind:value={newAnchor.lng} placeholder="-103.3444"></div>
      <div class="field"><label>Year</label><input type="number" bind:value={newAnchor.year} placeholder="1850"></div>
      <div class="field"><label>Narrator</label><input type="text" bind:value={newAnchor.narrator} placeholder="Severo Díaz Galindo"></div>
      <div class="field"><label>Type</label>
        <select bind:value={newAnchor.type}>
          {#each types as t}<option value={t}>{t}</option>{/each}
        </select>
      </div>
      <div class="field"><label>Sort Order</label><input type="number" bind:value={newAnchor.sort_order} placeholder="0"></div>
    </div>
    <div class="field full-width"><label>Description</label><input type="text" bind:value={newAnchor.description} placeholder="Short historical description"></div>
    <button class="btn-add" onclick={addAnchor}>Add Anchor</button>
  </section>

  <!-- Table -->
  <section class="table-section">
    {#if anchors.length === 0}
      <div class="empty-state"><p>No anchors yet.</p></div>
    {:else}
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th class="col-active">Active</th>
              <th>ID / Name</th>
              <th>Lat</th>
              <th>Lng</th>
              <th>Year</th>
              <th>Narrator</th>
              <th>Type</th>
              <th class="col-order">Order</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each anchors as a (a.id)}
              {#if editingId === a.id}
                <tr class="edit-row">
                  <td><input type="checkbox" bind:checked={editData.active} /></td>
                  <td>
                    <input type="text" bind:value={editData.name} class="edit-input" />
                    <input type="text" bind:value={editData.description} class="edit-input desc" placeholder="Description" />
                    <input type="text" bind:value={editData.image_url} class="edit-input desc" placeholder="Image URL" />
                    <input type="text" bind:value={editData.audio_url} class="edit-input desc" placeholder="Audio URL" />
                  </td>
                  <td><input type="number" step="any" bind:value={editData.lat} class="edit-input coord" /></td>
                  <td><input type="number" step="any" bind:value={editData.lng} class="edit-input coord" /></td>
                  <td><input type="number" bind:value={editData.year} class="edit-input small" /></td>
                  <td><input type="text" bind:value={editData.narrator} class="edit-input" /></td>
                  <td>
                    <select bind:value={editData.type}>
                      {#each types as t}<option value={t}>{t}</option>{/each}
                    </select>
                  </td>
                  <td><input type="number" bind:value={editData.sort_order} class="edit-input small" /></td>
                  <td class="actions-cell">
                    <button class="btn-save" onclick={saveEdit}>💾</button>
                    <button class="btn-cancel" onclick={() => editingId = null}>✕</button>
                  </td>
                </tr>
              {:else}
                <tr class:inactive={!a.active}>
                  <td>
                    <button class="toggle-btn" class:on={a.active} onclick={() => toggleActive(a)}>
                      {a.active ? '●' : '○'}
                    </button>
                  </td>
                  <td>
                    <div class="name-cell">
                      <strong>{a.name}</strong>
                      <span class="id-text">{a.id}</span>
                      {#if a.description}<span class="desc-text">{a.description}</span>{/if}
                    </div>
                  </td>
                  <td class="coord-cell">{a.lat}</td>
                  <td class="coord-cell">{a.lng}</td>
                  <td class="year-cell">{a.year || '—'}</td>
                  <td class="narrator-cell">{a.narrator || '—'}</td>
                  <td><span class="type-badge">{a.type}</span></td>
                  <td class="order-cell">{a.sort_order || 0}</td>
                  <td class="actions-cell">
                    <button class="btn-edit" onclick={() => startEdit(a)}>✏️</button>
                    <button class="btn-delete" onclick={() => deleteAnchor(a.id, a.name)}>🗑️</button>
                    <a href="https://www.google.com/maps?q={a.lat},{a.lng}" target="_blank" rel="noopener" class="btn-map" title="Open in Google Maps">📍</a>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <div class="back-link">
    <a href="/">← Back to Tour</a>
    <span class="divider">|</span>
    <a href="/api/anchors">Public API</a>
  </div>
</div>

<style>
  .admin-container { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
  .page-header { margin-bottom: 2rem; }
  .page-header h1 {
    font-size: 1.75rem; font-weight: 300; color: var(--text, #e4e4e7);
    margin-bottom: 0.5rem;
  }
  .subtitle { color: var(--text-muted, #71717a); font-size: 0.9rem; }
  .message {
    padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem;
    background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); color: #4ade80;
  }
  .message.error {
    background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.3); color: #f87171;
  }
  .add-section {
    background: var(--surface, #141417); border: 1px solid var(--border, #27272a);
    border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;
  }
  .add-section h2 { font-size: 1.1rem; font-weight: 400; color: var(--text, #e4e4e7); margin-bottom: 1rem; }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .full-width { margin-bottom: 1rem; }
  .field label {
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted, #71717a); font-weight: 600;
  }
  .field input, .field select {
    background: var(--bg, #09090b); border: 1px solid var(--border, #27272a); border-radius: 6px;
    padding: 0.5rem 0.75rem; color: var(--text, #e4e4e7); font-size: 0.85rem;
  }
  .field input:focus, .field select:focus { outline: none; border-color: #c9a87c; }
  .btn-add {
    background: #c9a87c; color: #09090b; border: none; border-radius: 8px;
    padding: 0.6rem 1.5rem; font-weight: 600; cursor: pointer; font-size: 0.9rem;
  }
  .btn-add:hover { opacity: 0.85; }

  .table-section { margin-bottom: 2rem; }
  .empty-state {
    text-align: center; padding: 3rem 2rem; background: var(--surface, #141417);
    border: 1px solid var(--border, #27272a); border-radius: 12px; color: var(--text-muted, #71717a);
  }
  .table-wrapper {
    overflow-x: auto; border-radius: 12px; border: 1px solid var(--border, #27272a);
    background: var(--surface, #141417);
  }
  table { width: 100%; border-collapse: collapse; min-width: 900px; }
  th {
    background: rgba(255,255,255,0.03); padding: 0.75rem 0.75rem; text-align: left;
    font-weight: 600; color: var(--text-muted, #71717a); font-size: 0.7rem;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  td {
    padding: 0.75rem 0.75rem; border-top: 1px solid var(--border, #27272a);
    color: var(--text, #e4e4e7); font-size: 0.85rem; vertical-align: top;
  }
  tr:hover { background: rgba(255,255,255,0.02); }
  tr.inactive { opacity: 0.45; }
  tr.edit-row { background: rgba(201, 168, 124, 0.05); }

  .col-active { width: 45px; text-align: center; }
  .col-order { width: 55px; text-align: center; }
  .col-actions { width: 95px; text-align: center; }

  .name-cell { display: flex; flex-direction: column; gap: 0.15rem; }
  .id-text { font-size: 0.7rem; color: var(--text-muted, #71717a); font-family: monospace; }
  .desc-text { font-size: 0.7rem; color: var(--text-muted, #71717a); line-height: 1.4; max-width: 250px; }
  .coord-cell { font-family: monospace; font-size: 0.78rem; color: var(--text-muted, #71717a); white-space: nowrap; }
  .year-cell, .order-cell { text-align: center; }
  .narrator-cell { font-size: 0.8rem; }

  .type-badge {
    padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.65rem;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    background: rgba(167, 139, 250, 0.12); color: #a78bfa;
  }

  .toggle-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: var(--text-muted, #71717a); }
  .toggle-btn.on { color: #4ade80; }

  .actions-cell { white-space: nowrap; }
  .btn-edit, .btn-delete, .btn-save, .btn-cancel, .btn-map {
    background: none; border: 1px solid transparent; cursor: pointer;
    padding: 0.3rem 0.4rem; border-radius: 6px; font-size: 0.85rem;
    transition: all 0.2s; text-decoration: none;
  }
  .btn-edit:hover { background: rgba(96, 165, 250, 0.1); }
  .btn-delete:hover { background: rgba(248, 113, 113, 0.1); }
  .btn-save { color: #4ade80; }
  .btn-save:hover { background: rgba(74, 222, 128, 0.1); }
  .btn-cancel { color: var(--text-muted, #71717a); }
  .btn-cancel:hover { background: rgba(255,255,255,0.05); }
  .btn-map { color: var(--text-muted, #71717a); }
  .btn-map:hover { color: #c9a87c; }

  .edit-input {
    background: var(--bg, #09090b); border: 1px solid var(--border, #27272a); border-radius: 4px;
    padding: 0.3rem 0.5rem; color: var(--text, #e4e4e7); font-size: 0.8rem; width: 100%; margin-bottom: 0.25rem;
  }
  .edit-input.coord { width: 100px; font-family: monospace; }
  .edit-input.small { width: 60px; text-align: center; }
  .edit-input:focus { outline: none; border-color: #c9a87c; }

  .back-link { margin-top: 2rem; display: flex; gap: 1rem; align-items: center; }
  .back-link a { color: var(--text-muted, #71717a); text-decoration: none; font-size: 0.9rem; }
  .back-link a:hover { color: #c9a87c; }
  .divider { color: var(--border, #27272a); }
</style>
