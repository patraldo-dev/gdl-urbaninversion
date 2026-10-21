<script>
    import { ANCHORS } from '$lib/anchors';
</script>

<svelte:head>
    <title>Recorrido — GDL Urban Inversion</title>
    <meta name="description" content="Recorrido cultural inmersivo por la historia astronómica y científica de Guadalajara." />
</svelte:head>

<div class="tour-page">
    <div class="tour-header">
        <a href="/" class="back-link">← Inmersión</a>
        <h1>Recorrido Astronómico</h1>
        <p class="subtitle">Máquina del tiempo por las calles de Guadalajara</p>
    </div>

    <div class="timeline">
        {#each ANCHORS as anchor, i}
        <div class="timeline-item">
            <div class="timeline-line">
                <div class="timeline-dot">{i + 1}</div>
                {#if i < ANCHORS.length - 1}
                <div class="timeline-connector"></div>
                {/if}
            </div>
            <div class="timeline-content">
                <div class="year-badge">{anchor.year}</div>
                <h3>{anchor.name}</h3>
                <p>{anchor.description}</p>
                <div class="meta">
                    <span>🎙️ {anchor.narrator}</span>
                </div>
                <div class="actions">
                    <a href="/map" class="btn-secondary">🗺️ Ver en mapa</a>
                    <a href="/ar" class="btn-primary">🥽 Ver en AR</a>
                </div>
            </div>
        </div>
        {/each}
    </div>

    <div class="coming-soon">
        <p>🔜 El recorrido guiado con narración automática y geolocalización estará disponible próximamente.</p>
    </div>
</div>

<style>
    .tour-page {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem 1rem;
        min-height: 100vh;
    }
    .tour-header {
        margin-bottom: 2rem;
    }
    .back-link {
        color: #c9a87c;
        font-size: 0.85rem;
        text-decoration: none;
    }
    h1 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        font-size: 1.8rem;
        margin: 0.5rem 0 0.25rem;
    }
    .subtitle {
        color: #71717a;
        font-size: 0.9rem;
        font-style: italic;
        margin: 0;
    }
    .timeline {
        display: flex;
        flex-direction: column;
    }
    .timeline-item {
        display: flex;
        gap: 1rem;
    }
    .timeline-line {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
    }
    .timeline-dot {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .timeline-connector {
        width: 2px;
        flex: 1;
        background: linear-gradient(to bottom, #c9a87c, #333);
        min-height: 40px;
    }
    .timeline-content {
        background: #141417;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 1.25rem;
        margin-bottom: 1rem;
        flex: 1;
    }
    .year-badge {
        display: inline-block;
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        font-size: 0.75rem;
        padding: 2px 10px;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }
    .timeline-content h3 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        margin: 0 0 0.4rem;
        font-size: 1.05rem;
    }
    .timeline-content p {
        color: #a1a1aa;
        font-size: 0.85rem;
        line-height: 1.5;
        margin: 0 0 0.75rem;
    }
    .meta {
        color: #71717a;
        font-size: 0.8rem;
        margin-bottom: 0.75rem;
    }
    .actions {
        display: flex;
        gap: 0.5rem;
    }
    .btn-primary, .btn-secondary {
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 700;
        text-decoration: none;
        text-align: center;
    }
    .btn-primary {
        background: #c9a87c;
        color: #09090b;
    }
    .btn-secondary {
        background: transparent;
        color: #c9a87c;
        border: 1px solid #c9a87c44;
    }
    .coming-soon {
        text-align: center;
        margin-top: 2rem;
        padding: 1.5rem;
        border: 1px dashed #333;
        border-radius: 12px;
    }
    .coming-soon p {
        color: #71717a;
        font-size: 0.85rem;
        margin: 0;
    }
</style>
