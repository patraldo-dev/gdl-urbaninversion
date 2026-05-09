<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { ANCHORS } from '$lib/anchors';
    import { locationState } from '$lib/location.svelte.js';
    import { applyRadioEffect } from '$lib/vintage-radio.js';

    let videoEl = $state(null);
    let canvasEl = $state(null);
    let audioEl = $state(null);
    let ctx = $state(null);

    let xrSupported = $state(false);
    let xrSession = $state(null);
    let inAR = $state(false);

    let currentAnchor = $state(null);
    let isPlaying = $state(false);
    let radioFx = $state(null);

    let compass = $state(0);
    let showCompass = $state(false);

    let status = $state('Inicializando cámara...');
    let error = $state(null);

    // Camera feed for non-AR fallback
    let cameraStream = $state(null);

    // Reticle for AR placement
    let reticlePulse = $state(false);

    // Track position reactively — reading .position ensures $state dependency is tracked
    $effect(() => {
        const { lat, lon } = locationState.position;
        if (lat === 0) return;
        let nearest = null;
        let nearestDist = Infinity;
        for (const anchor of ANCHORS) {
            const d = haversine(lat, lon, anchor.lat, anchor.lon);
            if (d < nearestDist) { nearestDist = d; nearest = anchor; }
        }
        currentAnchor = nearestDist < 50 ? nearest : null;
    });

    async function initCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            cameraStream = stream;
            if (videoEl) {
                videoEl.srcObject = stream;
                await videoEl.play();
            }
            status = 'Cámara activa';
        } catch (e) {
            error = 'No se pudo acceder a la cámara. Verifica los permisos.';
            status = 'Sin cámara';
        }
    }

    async function initCompass() {
        // iOS 13+ needs permission
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const perm = await DeviceOrientationEvent.requestPermission();
                if (perm === 'granted') {
                    showCompass = true;
                    window.addEventListener('deviceorientation', handleOrientation);
                }
            } catch { /* non-iOS */ }
        } else {
            showCompass = true;
            window.addEventListener('deviceorientation', handleOrientation);
        }
    }

    function handleOrientation(e) {
        if (e.alpha !== null) compass = Math.round(e.alpha);
    }

    async function checkXR() {
        if (!browser || !navigator.xr) return;
        try {
            xrSupported = await navigator.xr.isSessionSupported('immersive-ar');
        } catch {
            xrSupported = false;
        }
    }

    async function startAR() {
        if (!xrSupported) return;
        try {
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['dom-overlay', 'hit-test'],
                domOverlay: { root: document.getElementById('ar-overlay') }
            });
            xrSession = session;
            inAR = true;
            status = 'AR activo';

            session.addEventListener('end', () => {
                inAR = false;
                xrSession = null;
                status = 'AR finalizado';
            });

            // Start location watching for proximity
            locationState.startWatching();
        } catch (e) {
            error = `AR no disponible: ${e.message}`;
        }
    }

    async function playNarration(scene = 'welcome') {
        if (isPlaying || !currentAnchor) return;
        isPlaying = true;
        try {
            const res = await fetch(`/api/narrator?scene=${scene}&anchor=${currentAnchor.id}`);
            if (res.headers.get('Content-Type')?.includes('audio')) {
                const blob = await res.blob();
                if (audioEl) {
                    audioEl.src = URL.createObjectURL(blob);
                    radioFx = applyRadioEffect(audioEl);
                    audioEl.play();
                    audioEl.onended = () => { isPlaying = false; radioFx?.cleanup(); };
                }
            } else {
                const data = await res.json();
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(data.text);
                    utterance.lang = 'es-MX';
                    utterance.rate = 0.85;
                    utterance.pitch = 0.8;
                    speechSynthesis.speak(utterance);
                    utterance.onend = () => { isPlaying = false; };
                } else {
                    isPlaying = false;
                }
            }
        } catch {
            isPlaying = false;
        }
    }

    function startFallbackMode() {
        locationState.startWatching();
        status = 'Modo cámara activo';
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    $effect(() => {
        if (!currentAnchor) return;
        reticlePulse = true;
        const timer = setTimeout(() => reticlePulse = false, 600);
        return () => clearTimeout(timer);
    });

    onMount(async () => {
        if (!browser) return;
        await Promise.all([initCamera(), initCompass(), checkXR()]);
        if (!xrSupported) {
            startFallbackMode();
        }
    });

    function getDistanceText() {
        if (!currentAnchor || locationState.position.lat === 0) return '';
        const d = haversine(
            locationState.position.lat, locationState.position.lon,
            currentAnchor.lat, currentAnchor.lon
        );
        if (d < 50) return `A ${Math.round(d)}m — Estás aquí`;
        if (d < 200) return `A ${Math.round(d)}m — Cerca`;
        if (d < 1000) return `A ${Math.round(d)}m`;
        return `A ${(d / 1000).toFixed(1)}km`;
    }
</script>

<svelte:head>
    <title>Realidad Aumentada — GDL Urban Inversion</title>
</svelte:head>

<audio bind:this={audioEl}></audio>

<div class="ar-page">
    <!-- Camera feed (full screen) -->
    <div class="camera-feed">
        <video bind:this={videoEl} autoplay playsinline muted></video>
        <div class="camera-overlay">
            <!-- Top bar -->
            <div class="ar-topbar">
                <a href="/" class="ar-back">←</a>
                <div class="ar-status" class:active={inAR}>
                    {inAR ? '🥽 AR' : '📷 Cámara'}
                </div>
                {#if showCompass}
                <div class="ar-compass">
                    <span class="compass-arrow" style="transform: rotate({compass}deg)">↑</span>
                    <span class="compass-deg">{compass}°</span>
                </div>
                {/if}
            </div>

            <!-- Crosshair / Reticle -->
            <div class="reticle" class:pulse={reticlePulse}>
                <div class="reticle-ring"></div>
                <div class="reticle-cross"></div>
            </div>

            <!-- Anchor info card (appears when near an anchor) -->
            {#if currentAnchor}
            <div class="anchor-overlay" class:nearby={getDistanceText().includes('Estás aquí')}>
                <div class="anchor-year">{currentAnchor.year}</div>
                <h3>{currentAnchor.name}</h3>
                <p class="anchor-dist">{getDistanceText()}</p>
                <p class="anchor-narrator">🎙️ {currentAnchor.narrator}</p>

                <button class="btn-listen" onclick={() => playNarration('welcome')} disabled={isPlaying}>
                    {isPlaying ? '🔊 Escuchando...' : '🎙️ Escuchar narración'}
                </button>

                {#if isPlaying}
                <div class="radio-static">
                    <span class="static-bar"></span>
                    <span class="static-bar delay-1"></span>
                    <span class="static-bar delay-2"></span>
                    <span class="static-bar delay-3"></span>
                    <span class="static-bar delay-4"></span>
                </div>
                {/if}
            </div>
            {:else if locationState.position.lat !== 0}
            <div class="no-anchor">
                <p>No hay puntos históricos cercanos</p>
                <p class="hint">Camina hacia un punto del <a href="/map">mapa</a></p>
            </div>
            {/if}

            <!-- Bottom navigation -->
            <div class="ar-bottom">
                {#if xrSupported && !inAR}
                <button class="btn-ar-start" onclick={startAR}>
                    🥽 Entrar en AR
                </button>
                {/if}

                <div class="ar-nav">
                    <a href="/map" class="nav-btn">🗺️</a>
                    <a href="/tour" class="nav-btn">📜</a>
                    <button class="nav-btn" onclick={() => {
                        if (locationState.watching) locationState.stopWatching();
                        else locationState.startWatching();
                    }}>
                        📍 {locationState.watching ? '●' : '○'}
                    </button>
                </div>
            </div>
        </div>

        {#if error}
        <div class="ar-error">
            <p>{error}</p>
        </div>
        {/if}
    </div>

    <!-- AR DOM overlay (for WebXR dom-overlay feature) -->
    <div id="ar-overlay" class="ar-dom-overlay">
        {#if inAR && currentAnchor}
        <div class="xr-anchor-card">
            <div class="xr-year">{currentAnchor.year}</div>
            <h3>{currentAnchor.name}</h3>
            <button class="xr-listen-btn" onclick={() => playNarration('welcome')} disabled={isPlaying}>
                {isPlaying ? '🔊' : '🎙️ Escuchar'}
            </button>
        </div>
        {/if}
    </div>
</div>

<style>
    .ar-page {
        position: fixed;
        inset: 0;
        background: #000;
        overflow: hidden;
    }
    .camera-feed {
        position: relative;
        width: 100%;
        height: 100%;
    }
    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .camera-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 1rem;
        background: linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.6) 100%);
    }

    /* Top bar */
    .ar-topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .ar-back {
        color: #fff;
        text-decoration: none;
        font-size: 1.5rem;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.4);
        border-radius: 50%;
    }
    .ar-status {
        color: #a1a1aa;
        font-size: 0.8rem;
        background: rgba(0,0,0,0.4);
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
    }
    .ar-status.active {
        color: #c9a87c;
        border: 1px solid #c9a87c;
    }
    .ar-compass {
        background: rgba(0,0,0,0.4);
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .compass-arrow {
        color: #c9a87c;
        font-size: 0.9rem;
        transition: transform 0.3s;
    }
    .compass-deg {
        color: #71717a;
        font-size: 0.5rem;
    }

    /* Reticle */
    .reticle {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
    }
    .reticle-ring {
        width: 80px;
        height: 80px;
        border: 2px solid rgba(201, 168, 124, 0.5);
        border-radius: 50%;
        position: absolute;
    }
    .reticle-cross {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
    .reticle-cross::before, .reticle-cross::after {
        content: '';
        position: absolute;
        background: rgba(201, 168, 124, 0.7);
    }
    .reticle-cross::before {
        width: 1px;
        height: 20px;
        top: -10px;
        left: 0;
    }
    .reticle-cross::after {
        width: 20px;
        height: 1px;
        top: 0;
        left: -10px;
    }
    .reticle.pulse .reticle-ring {
        animation: reticlePulse 0.6s ease-out;
    }
    @keyframes reticlePulse {
        0% { transform: scale(1); border-color: #c9a87c; }
        50% { transform: scale(1.3); border-color: #c9a87c; }
        100% { transform: scale(1); border-color: rgba(201, 168, 124, 0.5); }
    }

    /* Anchor overlay card */
    .anchor-overlay {
        background: rgba(9, 9, 11, 0.85);
        backdrop-filter: blur(10px);
        border: 1px solid #333;
        border-radius: 16px;
        padding: 1.25rem;
        margin: 0 0.5rem;
        transition: border-color 0.3s;
    }
    .anchor-overlay.nearby {
        border-color: #c9a87c;
        box-shadow: 0 0 20px rgba(201, 168, 124, 0.2);
    }
    .anchor-year {
        display: inline-block;
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        font-size: 0.7rem;
        padding: 2px 8px;
        border-radius: 4px;
        margin-bottom: 0.4rem;
    }
    .anchor-overlay h3 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        font-size: 1.1rem;
        margin: 0 0 0.3rem;
    }
    .anchor-dist {
        color: #c9a87c;
        font-size: 0.8rem;
        margin: 0 0 0.3rem;
    }
    .anchor-narrator {
        color: #71717a;
        font-size: 0.75rem;
        margin: 0 0 0.75rem;
    }
    .btn-listen {
        width: 100%;
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 10px;
        padding: 0.7rem;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
    }
    .btn-listen:disabled { opacity: 0.5; cursor: default; }

    /* Radio static animation */
    .radio-static {
        display: flex;
        gap: 3px;
        align-items: flex-end;
        height: 14px;
        margin-top: 0.6rem;
        justify-content: center;
    }
    .static-bar {
        width: 3px;
        background: #c9a87c;
        border-radius: 2px;
        animation: staticBar 0.4s ease-in-out infinite alternate;
    }
    .delay-1 { animation-delay: 0.05s; }
    .delay-2 { animation-delay: 0.1s; }
    .delay-3 { animation-delay: 0.15s; }
    .delay-4 { animation-delay: 0.2s; }
    @keyframes staticBar { from { height: 3px; } to { height: 14px; } }

    /* No anchor nearby */
    .no-anchor {
        text-align: center;
        padding: 1rem;
    }
    .no-anchor p {
        color: #71717a;
        font-size: 0.85rem;
        margin: 0;
    }
    .no-anchor .hint a {
        color: #c9a87c;
    }

    /* Bottom bar */
    .ar-bottom {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        align-items: center;
    }
    .btn-ar-start {
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 30px;
        padding: 0.8rem 2rem;
        font-weight: 700;
        font-size: 0.95rem;
        cursor: pointer;
    }
    .ar-nav {
        display: flex;
        gap: 1rem;
    }
    .nav-btn {
        background: rgba(0,0,0,0.4);
        border: none;
        color: #e4e4e7;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        cursor: pointer;
        text-decoration: none;
    }

    /* Error */
    .ar-error {
        position: absolute;
        bottom: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(9, 9, 11, 0.9);
        border: 1px solid #ef4444;
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 300px;
        text-align: center;
    }
    .ar-error p { color: #fca5a5; font-size: 0.85rem; }

    /* WebXR DOM overlay */
    .ar-dom-overlay {
        display: none;
    }
    :global(.ar-dom-overlay:has(.xr-anchor-card)) {
        display: block;
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
    }
    .xr-anchor-card {
        background: rgba(9, 9, 11, 0.85);
        backdrop-filter: blur(10px);
        border: 1px solid #c9a87c;
        border-radius: 16px;
        padding: 1rem 1.5rem;
        text-align: center;
    }
    .xr-year {
        display: inline-block;
        background: #c9a87c;
        color: #09090b;
        font-weight: 700;
        font-size: 0.7rem;
        padding: 2px 8px;
        border-radius: 4px;
        margin-bottom: 0.3rem;
    }
    .xr-anchor-card h3 {
        font-family: 'Playfair Display', serif;
        color: #e4e4e7;
        font-size: 1rem;
        margin: 0.3rem 0;
    }
    .xr-listen-btn {
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 10px;
        padding: 0.5rem 1.5rem;
        font-weight: 700;
        font-size: 0.85rem;
        cursor: pointer;
    }
    .xr-listen-btn:disabled { opacity: 0.5; }
</style>
