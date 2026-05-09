<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import {
        playDiscoveryPing,
        playBrassOpen,
        startClockTicking,
        cleanupSpatialAudio
    } from '$lib/spatial-audio.js';

    let { anchor, distance } = $props();

    // State machine: locked → ready → opening → revealed
    let capsuleState = $state('locked');
    let clockTicking = $state(null);
    let revealProgress = $state(0);

    // Trigger "ready" when within 5m
    $effect(() => {
        if (distance < 5 && capsuleState === 'locked') {
            capsuleState = 'ready';
            if (browser) playDiscoveryPing();
        }
        if (distance >= 5 && capsuleState === 'ready') {
            capsuleState = 'locked';
        }
    });

    async function openCapsule() {
        if (capsuleState !== 'ready') return;
        capsuleState = 'opening';

        // Start clock ticking ambiance
        clockTicking = startClockTicking();

        // Play brass opening sound
        playBrassOpen();

        // Animate reveal
        for (let i = 0; i <= 100; i += 3) {
            revealProgress = i;
            await new Promise(r => setTimeout(r, 20));
        }

        // Stop ticking, transition to revealed
        if (clockTicking) {
            clockTicking.gain.gain.exponentialRampToValueAtTime(0.001, getCtx2().currentTime + 0.5);
            setTimeout(() => {
                try { clockTicking.source.stop(); } catch {}
            }, 600);
        }

        revealProgress = 100;
        capsuleState = 'revealed';
    }

    function getCtx2() {
        return window.AudioContext ? new AudioContext() : new webkitAudioContext();
    }

    onMount(() => {
        return () => {
            // Cleanup
            if (clockTicking) {
                try { clockTicking.source.stop(); } catch {}
            }
        };
    });
</script>

{#if capsuleState === 'ready'}
<div class="capsule-container" class:glow={capsuleState === 'ready'}>
    <!-- Floating brass cylinder -->
    <button class="capsule-btn" onclick={openCapsule}>
        <div class="cylinder" style="animation-delay: {Math.random() * 0.5}s">
            <div class="cylinder-body">
                <div class="engraving">⏳</div>
                <div class="cylinder-rim top"></div>
                <div class="cylinder-rim bottom"></div>
                <span class="cylinder-year">{anchor.year}</span>
            </div>
        </div>
        <div class="capsule-label">Toca para abrir la Cápsula del Tiempo</div>
    </button>

    <!-- Golden particles -->
    <div class="particles">
        {#each Array(6) as _, i}
        <div class="particle" style="--delay: {i * 0.3}s; --x: {(Math.random() - 0.5) * 80}px"></div>
        {/each}
    </div>
</div>
{/if}

{#if capsuleState === 'opening'}
<div class="capsule-opening">
    <div class="opening-ring" style="--progress: {revealProgress}%"></div>
    <p class="opening-text">
        {#if revealProgress < 30}
        El mecanismo antiguo gira...
        {:else if revealProgress < 60}
        Las coordenadas del tiempo se alinean...
        {:else if revealProgress < 90}
        {anchor.narrator} susurra desde el pasado...
        {:else}
        La cápsula se abre.
        {/if}
    </p>
</div>
{/if}

{#if capsuleState === 'revealed'}
<div class="capsule-revealed">
    <div class="reveal-glow"></div>
    <div class="scroll">
        <div class="scroll-header">
            <span class="scroll-era">📡 {anchor.year}</span>
            <span class="scroll-from">{anchor.narrator}</span>
        </div>
        <div class="scroll-body">
            <slot name="message">
                <p>El mensaje del pasado se ha revelado.</p>
            </slot>
        </div>
        <button class="btn-listen-capsule" onclick={() => {
            // Dispatch custom event for parent to handle narration
            const event = new CustomEvent('playcapsule', { detail: { anchorId: anchor.id } });
            document.dispatchEvent(event);
        }}>
            🎙️ Escuchar la Cápsula del Tiempo
        </button>
    </div>
</div>
{/if}

<style>
    .capsule-container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
    }
    .capsule-btn {
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    /* Floating brass cylinder */
    .cylinder {
        animation: float 3s ease-in-out infinite;
    }
    @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(-2deg); }
        50% { transform: translateY(-12px) rotate(2deg); }
    }

    .cylinder-body {
        width: 60px;
        height: 80px;
        background: linear-gradient(135deg, #c9a87c 0%, #8b6914 40%, #c9a87c 60%, #a0844a 100%);
        border-radius: 8px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 32px rgba(201, 168, 124, 0.3),
                    inset 0 1px 2px rgba(255, 255, 255, 0.3);
    }
    .cylinder-rim {
        position: absolute;
        left: -2px;
        right: -2px;
        height: 8px;
        background: linear-gradient(180deg, #d4b88a, #8b6914);
        border-radius: 4px;
    }
    .cylinder-rim.top { top: -2px; }
    .cylinder-rim.bottom { bottom: -2px; }
    .engraving {
        font-size: 1.5rem;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
    }
    .cylinder-year {
        position: absolute;
        bottom: 12px;
        font-size: 0.55rem;
        color: rgba(0, 0, 0, 0.5);
        font-weight: 700;
        letter-spacing: 1px;
    }
    .capsule-label {
        color: #c9a87c;
        font-size: 0.75rem;
        margin-top: 0.75rem;
        text-align: center;
        animation: labelPulse 2s ease-in-out infinite;
    }
    @keyframes labelPulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
    }

    /* Golden glow effect */
    .glow::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -60%);
        width: 120px;
        height: 120px;
        background: radial-gradient(circle, rgba(201, 168, 124, 0.2) 0%, transparent 70%);
        border-radius: 50%;
        animation: glowPulse 2s ease-in-out infinite;
    }
    @keyframes glowPulse {
        0%, 100% { transform: translate(-50%, -60%) scale(1); opacity: 0.5; }
        50% { transform: translate(-50%, -60%) scale(1.3); opacity: 1; }
    }

    /* Particles */
    .particles {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }
    .particle {
        position: absolute;
        width: 3px;
        height: 3px;
        background: #c9a87c;
        border-radius: 50%;
        left: 50%;
        top: 40%;
        animation: particleRise 2.5s ease-out infinite;
        animation-delay: var(--delay);
        opacity: 0;
    }
    @keyframes particleRise {
        0% { transform: translate(var(--x), 0); opacity: 0; }
        20% { opacity: 0.8; }
        100% { transform: translate(var(--x), -60px); opacity: 0; }
    }

    /* Opening animation */
    .capsule-opening {
        text-align: center;
        padding: 2rem 1rem;
    }
    .opening-ring {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 3px solid #333;
        border-top-color: #c9a87c;
        margin: 0 auto 1rem;
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .opening-text {
        color: #c9a87c;
        font-size: 0.85rem;
        font-style: italic;
        animation: fadeInOut 1s ease-in-out;
    }
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(5px); }
        50% { opacity: 1; }
        100% { opacity: 1; transform: translateY(0); }
    }

    /* Revealed scroll */
    .capsule-revealed {
        position: relative;
        padding: 0.5rem;
    }
    .reveal-glow {
        position: absolute;
        inset: -20px;
        background: radial-gradient(circle, rgba(201, 168, 124, 0.15) 0%, transparent 70%);
        border-radius: 50%;
        animation: revealGlow 3s ease-out;
    }
    @keyframes revealGlow {
        0% { transform: scale(0.5); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: scale(1); opacity: 0.5; }
    }
    .scroll {
        background: rgba(20, 20, 23, 0.9);
        border: 1px solid #c9a87c;
        border-radius: 16px;
        padding: 1.25rem;
        position: relative;
        animation: scrollReveal 0.8s ease-out;
    }
    @keyframes scrollReveal {
        0% { transform: scaleY(0.3) translateY(20px); opacity: 0; }
        100% { transform: scaleY(1) translateY(0); opacity: 1; }
    }
    .scroll-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    .scroll-era {
        color: #c9a87c;
        font-size: 0.8rem;
        font-weight: 700;
    }
    .scroll-from {
        color: #71717a;
        font-size: 0.75rem;
        font-style: italic;
    }
    .scroll-body {
        color: #e4e4e7;
        font-size: 0.9rem;
        line-height: 1.6;
        margin-bottom: 1rem;
    }
    .btn-listen-capsule {
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
    .btn-listen-capsule:hover {
        background: #d4b88a;
    }
</style>
