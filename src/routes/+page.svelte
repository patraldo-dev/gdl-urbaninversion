<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { ANCHORS } from '$lib/anchors';
    import Loader from '$lib/components/Loader.svelte';

    let permissionState = $state({ gps: 'pending', camera: 'pending' });
    let gpsGranted = $state(false);
    let cameraGranted = $state(false);
    let userLat = $state(null);
    let userLon = $state(null);
    let ready = $state(false);
    let loading = $state(false);
    let loaderProgress = $state(0);

    async function animateLoader() {
        loading = true;
        loaderProgress = 0;
        // Simulate loading phases
        for (let i = 0; i <= 100; i += 2) {
            loaderProgress = i;
            await new Promise(r => setTimeout(r, 30));
        }
    }

    async function requestGPS() {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true, timeout: 10000
                });
            });
            userLat = pos.coords.latitude;
            userLon = pos.coords.longitude;
            gpsGranted = true;
            permissionState.gps = 'granted';
        } catch {
            permissionState.gps = 'denied';
        }
    }

    async function requestCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            // Release immediately — we just needed permission
            stream.getTracks().forEach(t => t.stop());
            cameraGranted = true;
            permissionState.camera = 'granted';
        } catch {
            permissionState.camera = 'denied';
        }
    }

    async function startImmersion() {
        await animateLoader();
        await requestGPS();
        await requestCamera();
        loading = false;
        ready = gpsGranted;
    }

    onMount(() => {
        // Check if permissions already granted
        if (browser && navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then(r => {
                if (r.state === 'granted') permissionState.gps = 'granted';
            });
        }
    });
</script>

<svelte:head>
    <title>Urban Inversion — Inmersión Cultural en Guadalajara</title>
    <meta name="description" content="Máquina del tiempo en las calles de Guadalajara. Recorrido cultural inmersivo por la historia astronómica de la ciudad." />
</svelte:head>

<div class="landing">
    <div class="landing-content">
        <div class="logo">GDL</div>
        <h1>Urban <span class="accent">Inversion</span></h1>
        <p class="tagline">Inversión Urbana. Inmersión Total.</p>
        <p class="description">
            Camina por Guadalajara y descubre la historia astronómica que duerme bajo sus calles.
            Telescopios del siglo XIX. Observatorios secretos. La voz de Don Severo Díaz Galindo
            esperándote en cada esquina.
        </p>

        {#if loading}
        <div class="loader-wrapper">
            <Loader bind:progress={loaderProgress} />
        </div>
        {:else if ready}
        <div class="immersion-ready">
            <div class="ready-icon">🔭</div>
            <h2>Estás listo para la inmersión</h2>
            <p class="your-location">Tu posición: {userLat?.toFixed(4)}, {userLon?.toFixed(4)}</p>

            <div class="nearby-info">
                {#each ANCHORS as anchor}
                    {@const dist = haversine(userLat, userLon, anchor.lat, anchor.lon)}
                    {#if dist < 1000}
                    <div class="nearby-card">
                        <span class="nearby-dist">{Math.round(dist)}m</span>
                        <strong>{anchor.name}</strong>
                        <span class="nearby-narrator">{anchor.narrator} te espera</span>
                    </div>
                    {/if}
                {/each}
            </div>

            <a href="/map" class="btn-explore">🗺️ Abrir el mapa</a>
            <a href="/ar" class="btn-ar">🥽 Modo Realidad Aumentada</a>
        </div>
        {:else}
        <div class="permissions-panel">
            <h2>Para sumergirte necesitas:</h2>

            <div class="permission-row" class:granted={gpsGranted} class:denied={permissionState.gps === 'denied'}>
                <span class="perm-icon">📍</span>
                <div class="perm-info">
                    <strong>Ubicación GPS</strong>
                    <span class="perm-status">
                        {permissionState.gps === 'pending' ? 'Para guiarte al punto histórico más cercano' :
                         permissionState.gps === 'granted' ? '✅ Activado' : '❌ Denegado'}
                    </span>
                </div>
            </div>

            <div class="permission-row" class:granted={cameraGranted} class:denied={permissionState.camera === 'denied'}>
                <span class="perm-icon">📷</span>
                <div class="perm-info">
                    <strong>Cámara AR</strong>
                    <span class="perm-status">
                        {permissionState.camera === 'pending' ? 'Para ver las capas históricas superpuestas' :
                         permissionState.camera === 'granted' ? '✅ Activada' : '❌ Denegada — puedes continuar sin AR'}
                    </span>
                </div>
            </div>

            <button class="btn-start" onclick={startImmersion} disabled={loading}>
                🔭 Enfocando el cielo de 1920...
            </button>

            {#if permissionState.gps === 'denied'}
            <p class="perm-warning">Necesitamos tu ubicación para activar la experiencia. Habilítala en ajustes del navegador.</p>
            {/if}
        </div>
        {/if}

        <div class="anchors-preview">
            {#each ANCHORS as anchor, i}
            <div class="preview-dot">
                <span class="dot-year">{anchor.year}</span>
                <span class="dot-label">{anchor.name.split('(')[0].trim()}</span>
            </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .landing {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #09090b 70%);
        padding: 2rem;
    }
    .landing-content {
        max-width: 500px;
        text-align: center;
    }
    .logo {
        font-family: 'Playfair Display', serif;
        font-size: 4rem;
        color: #c9a87c;
        font-weight: 700;
        line-height: 1;
        margin-bottom: 0.25rem;
    }
    h1 {
        font-family: 'Playfair Display', serif;
        font-size: 2rem;
        color: #e4e4e7;
        margin: 0;
    }
    .accent { color: #c9a87c; }
    .tagline {
        color: #71717a;
        font-size: 0.9rem;
        margin: 0.5rem 0 1.5rem;
        font-style: italic;
    }
    .description {
        color: #a1a1aa;
        font-size: 0.9rem;
        line-height: 1.6;
        margin-bottom: 2rem;
    }
    .permissions-panel {
        background: rgba(20, 20, 23, 0.6);
        border: 1px solid #333;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
    }
    .permissions-panel h2 {
        font-size: 0.95rem;
        color: #a1a1aa;
        margin: 0 0 1rem;
    }
    .permission-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 0.5rem;
        border: 1px solid transparent;
        transition: border-color 0.3s;
    }
    .permission-row.granted { border-color: #22c55e44; }
    .permission-row.denied { border-color: #ef444444; }
    .perm-icon { font-size: 1.5rem; }
    .perm-info { text-align: left; }
    .perm-info strong { color: #e4e4e7; font-size: 0.9rem; display: block; }
    .perm-status { color: #71717a; font-size: 0.75rem; }
    .btn-start {
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 10px;
        padding: 0.9rem 2rem;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        width: 100%;
        margin-top: 0.5rem;
    }
    .btn-start:disabled { opacity: 0.5; cursor: not-allowed; }
    .perm-warning {
        color: #f59e0b;
        font-size: 0.8rem;
        margin-top: 0.75rem;
    }
    .loader-wrapper {
        position: fixed;
        inset: 0;
        z-index: 2000;
    }
    .immersion-ready {
        background: rgba(20, 20, 23, 0.6);
        border: 1px solid #c9a87c44;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
    }
    .ready-icon { font-size: 3rem; margin-bottom: 0.5rem; }
    .immersion-ready h2 {
        font-family: 'Playfair Display', serif;
        color: #c9a87c;
        font-size: 1.2rem;
        margin: 0 0 0.5rem;
    }
    .your-location { color: #52525b; font-size: 0.75rem; margin: 0 0 1rem; }
    .nearby-card {
        background: rgba(201, 168, 124, 0.1);
        border: 1px solid #c9a87c33;
        border-radius: 8px;
        padding: 0.6rem;
        margin-bottom: 0.5rem;
        text-align: left;
    }
    .nearby-dist {
        color: #c9a87c;
        font-weight: 700;
        font-size: 0.8rem;
        margin-right: 0.5rem;
    }
    .nearby-card strong { color: #e4e4e7; font-size: 0.85rem; display: inline; }
    .nearby-narrator { color: #71717a; font-size: 0.75rem; display: block; margin-top: 0.15rem; }
    .btn-explore, .btn-ar {
        display: block;
        border-radius: 10px;
        padding: 0.8rem;
        font-weight: 700;
        font-size: 0.95rem;
        cursor: pointer;
        text-decoration: none;
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .btn-explore {
        background: #c9a87c;
        color: #09090b;
        border: none;
    }
    .btn-ar {
        background: transparent;
        color: #c9a87c;
        border: 1px solid #c9a87c;
    }
    .anchors-preview {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        margin-top: 1.5rem;
    }
    .preview-dot {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
    }
    .dot-year {
        font-size: 0.7rem;
        color: #c9a87c;
        font-weight: 700;
    }
    .dot-label {
        font-size: 0.6rem;
        color: #52525b;
        max-width: 80px;
        text-align: center;
    }
</style>
