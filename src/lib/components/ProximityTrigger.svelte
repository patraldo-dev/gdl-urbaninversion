<script>
    // ProximityTrigger — detects when user is near an anchor point
    // Triggers narration + WebXR experience

    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    let { anchor, radius = 20, onEnter, onExit } = $props();

    let watchId = null;
    let distance = $state(null);
    let isNearby = $state(false);
    let isActive = $state(false);
    let audio = null;
    let isPlaying = $state(false);

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    onMount(() => {
        if (!browser || !navigator.geolocation) return;

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                distance = calculateDistance(
                    pos.coords.latitude, pos.coords.longitude,
                    anchor.lat, anchor.lon
                );

                const wasNearby = isNearby;
                isNearby = distance < radius;

                if (isNearby && !wasNearby) {
                    // Vibrate if supported
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    onEnter?.(anchor);
                }

                if (!isNearby && wasNearby) {
                    onExit?.(anchor);
                }
            },
            (err) => {
                console.warn('Geolocation error:', err.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 10000,
            }
        );
    });

    onDestroy(() => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    });

    async function playNarration(scene = 'welcome') {
        if (isPlaying) return;
        isPlaying = true;
        isActive = true;

        try {
            // Try to get audio from server
            const res = await fetch(`/api/narrator?scene=${scene}`);
            if (res.headers.get('Content-Type')?.includes('audio')) {
                const blob = await res.blob();
                audio = new Audio(URL.createObjectURL(blob));
                audio.play();
                audio.onended = () => { isPlaying = false; };
            } else {
                // Fallback: Web Speech API
                const data = await res.json();
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(data.text);
                    utterance.lang = 'es-MX';
                    utterance.rate = 0.9;
                    utterance.pitch = 0.85; // deeper voice for Severo
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
</script>

{#if isNearby}
<div class="proximity-trigger" class:active={isActive}>
    <div class="trigger-pulse"></div>
    <div class="trigger-content">
        <div class="trigger-icon">🔭</div>
        <div class="trigger-info">
            <h3>{anchor.name}</h3>
            <p>{distance?.toFixed(0)}m — {anchor.narrator} te espera</p>
        </div>
        <button class="btn-listen" onclick={() => playNarration('welcome')} disabled={isPlaying}>
            {isPlaying ? '🔊 Escuchando...' : '🎙️ Escuchar a Don Severo'}
        </button>
    </div>
</div>
{/if}

<style>
    .proximity-trigger {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: rgba(9, 9, 11, 0.9);
        backdrop-filter: blur(12px);
        border: 2px solid #c9a87c;
        border-radius: 16px;
        padding: 1rem 1.5rem;
        max-width: 400px;
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
    .trigger-icon {
        font-size: 2rem;
        flex-shrink: 0;
    }
    .trigger-info {
        flex: 1;
    }
    .trigger-info h3 {
        color: #c9a87c;
        font-family: 'Playfair Display', serif;
        font-size: 0.95rem;
        margin: 0;
    }
    .trigger-info p {
        color: #71717a;
        font-size: 0.75rem;
        margin: 0.15rem 0;
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
    .btn-listen:disabled {
        opacity: 0.5;
    }
</style>
