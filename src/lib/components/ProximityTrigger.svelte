<script>
    // ProximityTrigger.svelte — Svelte 5 Runes + vintage radio effect
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { locationState } from '$lib/location.svelte.js';
    import { applyRadioEffect } from '$lib/vintage-radio.js';

    let { anchor, radius = 50 } = $props();

    let isNearby = $derived(locationState.isNear(anchor.id, radius));
    let distance = $derived(
        locationState.position.lat === 0 ? null :
        Math.round(haversineMeters(locationState.position.lat, locationState.position.lon, anchor.lat, anchor.lon))
    );

    let isPlaying = $state(false);
    let hasEntered = $state(false);
    let audioEl = $state(null);
    let radioFx = null;

    // Auto-trigger when nearby
    $effect(() => {
        if (isNearby && !hasEntered) {
            hasEntered = true;
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        if (!isNearby) {
            hasEntered = false;
        }
    });

    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    async function playNarration(scene = 'welcome') {
        if (isPlaying) return;
        isPlaying = true;

        try {
            const res = await fetch(`/api/narrator?scene=${scene}`);

            if (res.headers.get('Content-Type')?.includes('audio')) {
                // Server-side TTS with vintage radio effect
                const blob = await res.blob();
                if (audioEl) {
                    audioEl.src = URL.createObjectURL(blob);
                    radioFx = applyRadioEffect(audioEl);
                    audioEl.play();
                    audioEl.onended = () => {
                        isPlaying = false;
                        radioFx?.cleanup();
                    };
                }
            } else {
                // Fallback: Web Speech API
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

    onMount(() => {
        locationState.startWatching();
    });
</script>

<audio bind:this={audioEl}></audio>

{#if isNearby}
<div class="proximity-trigger">
    <div class="trigger-pulse"></div>
    <div class="trigger-content">
        <div class="trigger-icon">🔭</div>
        <div class="trigger-info">
            <h3>{anchor.name}</h3>
            <p class="trigger-distance">{distance}m — {anchor.narrator} te espera</p>
            <p class="trigger-year">{anchor.year}</p>
        </div>
        <button class="btn-listen" onclick={() => playNarration('welcome')} disabled={isPlaying}>
            {isPlaying ? '🔊 Escuchando...' : '🎙️ Radio de 1920'}
        </button>
    </div>
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
{/if}

<style>
    .proximity-trigger {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: rgba(9, 9, 11, 0.92);
        backdrop-filter: blur(12px);
        border: 2px solid #c9a87c;
        border-radius: 16px;
        padding: 1rem 1.5rem;
        max-width: 420px;
        width: 90%;
        animation: slideUp 0.5s ease-out;
    }
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    .trigger-pulse {
        position: absolute;
        top: -4px; left: -4px; right: -4px; bottom: -4px;
        border: 2px solid rgba(201, 168, 124, 0.3);
        border-radius: 18px;
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.02); }
    }
    .trigger-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .trigger-icon { font-size: 2rem; flex-shrink: 0; }
    .trigger-info { flex: 1; }
    .trigger-info h3 {
        color: #c9a87c;
        font-family: 'Playfair Display', serif;
        font-size: 0.95rem;
        margin: 0;
    }
    .trigger-distance {
        color: #71717a;
        font-size: 0.75rem;
        margin: 0.15rem 0 0;
    }
    .trigger-year {
        color: #52525b;
        font-size: 0.65rem;
        margin: 0.1rem 0 0;
    }
    .btn-listen {
        background: #c9a87c;
        color: #09090b;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 0.8rem;
        font-weight: 700;
        font-size: 0.75rem;
        cursor: pointer;
        white-space: nowrap;
    }
    .btn-listen:disabled { opacity: 0.5; }

    /* Radio static bars animation */
    .radio-static {
        display: flex;
        gap: 3px;
        align-items: flex-end;
        height: 12px;
        margin-top: 0.5rem;
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
    @keyframes staticBar {
        from { height: 3px; }
        to { height: 12px; }
    }
</style>
