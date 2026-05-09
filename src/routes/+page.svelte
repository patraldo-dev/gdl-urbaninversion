<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { ANCHORS } from '$lib/anchors';

    let mapEl = $state(null);
    let mapInstance = $state(null);
    let selectedAnchor = $state(null);

    const mapStyle = {
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    };

    onMount(async () => {
        if (!browser) return;
        const L = (await import('leaflet')).default;
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);

        mapInstance = L.map(mapEl, {
            center: [20.67485, -103.36],
            zoom: 14,
            zoomControl: true,
            attributionControl: false,
        });

        L.tileLayer(mapStyle.dark, { maxZoom: 18 }).addTo(mapInstance);

        // Add anchor markers
        for (const anchor of ANCHORS) {
            const icon = L.divIcon({
                className: 'anchor-marker',
                html: `<div class="anchor-pin">
                    <span class="anchor-year">${anchor.year}</span>
                    <span class="anchor-icon">${anchor.type === 'observatory' ? '🔭' : anchor.type === 'institute' ? '🏛️' : '📍'}</span>
                </div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
            });

            const marker = L.marker([anchor.lat, anchor.lon], { icon }).addTo(mapInstance);
            marker.on('click', () => {
                selectedAnchor = anchor;
            });

            marker.bindTooltip(anchor.name, {
                direction: 'top',
                offset: [0, -22],
                className: 'anchor-tooltip',
            });
        }

        // Draw route line connecting all anchors
        const routeCoords = ANCHORS.map(a => [a.lat, a.lon]);
        L.polyline(routeCoords, {
            color: '#c9a87c',
            weight: 2,
            opacity: 0.4,
            dashArray: '8, 8',
        }).addTo(mapInstance);
    });
</script>

<svelte:head>
    <title>GDL Urban Inversion — Recorrido Cultural Inmersivo</title>
</svelte:head>

<div class="gdl-page">
    <div class="gdl-hero">
        <div class="hero-content">
            <h1>GDL <span class="accent">Urban Inversion</span></h1>
            <p class="hero-subtitle">Máquina del tiempo en las calles de Guadalajara</p>
            <p class="hero-desc">Recorrido cultural inmersivo por la historia astronómica y científica de la ciudad</p>
        </div>
    </div>

    <div class="map-section">
        <div class="map-header">
            <h2>🗺️ Recorrido Astronómico</h2>
            <span class="map-count">{ANCHORS.length} puntos históricos</span>
        </div>
        <div class="map-container" bind:this={mapEl}></div>
    </div>

    {#if selectedAnchor}
    <div class="anchor-detail">
        <button class="close-btn" onclick={() => selectedAnchor = null}>✕</button>
        <div class="anchor-year-badge">{selectedAnchor.year}</div>
        <h3>{selectedAnchor.name}</h3>
        <p>{selectedAnchor.description}</p>
        <div class="anchor-meta">
            <span>🎙️ Narrador: {selectedAnchor.narrator}</span>
            <span>📍 {selectedAnchor.lat.toFixed(5)}, {selectedAnchor.lon.toFixed(5)}</span>
        </div>
        <button class="btn-immerse" onclick={() => window.open(`geo:${selectedAnchor.lat},${selectedAnchor.lon}`, '_blank')}>
            🥽 Abrir en mapa nativo
        </button>
    </div>
    {/if}

    <div class="anchors-list">
        {#each ANCHORS as anchor, i}
        <div class="anchor-card" onclick={() => { selectedAnchor = anchor; if (mapInstance) mapInstance.flyTo([anchor.lat, anchor.lon], 17, { duration: 1 }); }}>
            <div class="card-number">{i + 1}</div>
            <div class="card-content">
                <h3>{anchor.name}</h3>
                <p class="card-year">{anchor.year}</p>
                <p class="card-desc">{anchor.description.slice(0, 100)}...</p>
            </div>
            <div class="card-arrow">→</div>
        </div>
        {/each}
    </div>
</div>

<style>
    .gdl-page {
        max-width: 1000px;
        margin: 0 auto;
        padding: 2rem 1rem;
        font-family: 'Inter', sans-serif;
    }
    .gdl-hero {
        text-align: center;
        padding: 3rem 0 2rem;
    }
    .gdl-hero h1 {
        font-family: 'Playfair Display', serif;
        font-size: 3rem;
        color: #e4e4e7;
        margin: 0;
    }
    .accent {
        color: #c9a87c;
    }
    .hero-subtitle {
        font-size: 1.2rem;
        color: #c9a87c;
        margin: 0.5rem 0 0;
        font-style: italic;
    }
    .hero-desc {
        color: #71717a;
        font-size: 0.95rem;
        margin-top: 0.5rem;
    }
    .map-section {
        margin: 2rem 0;
    }
    .map-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    .map-header h2 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        margin: 0;
        font-size: 1.3rem;
    }
    .map-count {
        color: #c9a87c;
        font-size: 0.85rem;
    }
    .map-container {
        height: 450px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #333;
    }
    :global(.anchor-pin) {
        background: rgba(9,9,11,0.85);
        border: 2px solid #c9a87c;
        border-radius: 50%;
        width: 44px;
        height: 44px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }
    :global(.anchor-year) {
        font-size: 0.6rem;
        color: #c9a87c;
        font-weight: 700;
    }
    :global(.anchor-icon) {
        font-size: 1rem;
    }
    :global(.anchor-tooltip) {
        background: rgba(9,9,11,0.9) !important;
        color: #c9a87c !important;
        border: 1px solid #c9a87c !important;
        border-radius: 6px !important;
        font-family: 'Inter', sans-serif !important;
        font-size: 0.8rem !important;
    }
    .anchor-detail {
        background: #141417;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 1.5rem;
        position: relative;
        margin: 1rem 0;
    }
    .close-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: none;
        border: none;
        color: #71717a;
        font-size: 1.2rem;
        cursor: pointer;
    }
    .anchor-year-badge {
        display: inline-block;
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        font-size: 0.8rem;
        padding: 2px 10px;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }
    .anchor-detail h3 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        margin: 0 0 0.5rem;
    }
    .anchor-detail p {
        color: #a1a1aa;
        font-size: 0.9rem;
        line-height: 1.5;
    }
    .anchor-meta {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin: 1rem 0;
        color: #71717a;
        font-size: 0.8rem;
    }
    .btn-immerse {
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 8px;
        padding: 0.6rem 1.2rem;
        font-weight: 700;
        cursor: pointer;
    }
    .anchors-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }
    .anchor-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        background: #141417;
        border: 1px solid #333;
        border-radius: 10px;
        padding: 1rem;
        cursor: pointer;
        transition: border-color 0.2s;
    }
    .anchor-card:hover {
        border-color: #c9a87c;
    }
    .card-number {
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .card-content {
        flex: 1;
    }
    .card-content h3 {
        font-size: 0.95rem;
        color: #e4e4e7;
        margin: 0;
    }
    .card-year {
        color: #c9a87c;
        font-size: 0.75rem;
        margin: 0.15rem 0;
    }
    .card-desc {
        color: #71717a;
        font-size: 0.8rem;
        margin: 0;
    }
    .card-arrow {
        color: #c9a87c;
        font-size: 1.2rem;
    }
</style>
