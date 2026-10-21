<script>
    /**
     * Telescope-style loader — brass lens focusing effect
     * @property {number} progress - 0 to 100, bindable
     */
    let { progress = $bindable(0) } = $props();

    // Lens rotation based on progress
    let rotation = $derived(progress * 3.6);

    // Shutter open amount (0 = closed, 1 = fully open)
    let shutterOpen = $derived(progress / 100);
</script>

<div class="loader-container">
    <div class="telescope-assembly">
        <!-- Outer brass ring -->
        <div class="brass-ring">
            <!-- Engraved degree marks -->
            {#each Array(12) as _, i}
            <div class="degree-mark" style="transform: rotate({i * 30}deg)">
                <div class="tick"></div>
            </div>
            {/each}
        </div>

        <!-- Rotating lens -->
        <div class="telescope-lens" style="transform: rotate({rotation}deg)">
            <!-- Iris shutter that opens with progress -->
            <div class="iris" style="--open: {shutterOpen}">
                {#each Array(6) as _, i}
                <div class="iris-blade" style="--i: {i}"></div>
                {/each}
            </div>

            <!-- Glass reflection -->
            <div class="glass-reflection"></div>

            <!-- Crosshair -->
            <div class="crosshair">
                <div class="cross-h"></div>
                <div class="cross-v"></div>
            </div>
        </div>

        <!-- Center dot -->
        <div class="center-dot"></div>
    </div>

    <div class="status">
        <p class="vintage-text">
            {progress < 20 ? 'Ajustando lentes...' :
             progress < 40 ? 'Calibrando telescopio...' :
             progress < 60 ? 'Enfocando el cielo de 1920...' :
             progress < 80 ? 'Sincronizando coordenadas...' :
             progress < 100 ? 'Casi listo...' :
             'Observatorio activado'}
        </p>
        <span class="percentage">{Math.round(progress)}%</span>
    </div>

    <!-- Static noise bar -->
    <div class="static-bar-container">
        {#each Array(40) as _, i}
        <div class="static-bar" style="animation-delay: {i * 0.02}s; height: {Math.random() * 12 + 2}px"></div>
        {/each}
    </div>
</div>

<style>
    .loader-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: radial-gradient(ellipse at 50% 40%, #1a1a2e 0%, #0a0a0a 70%);
        color: #d4af37;
        font-family: 'Courier New', Courier, monospace;
        position: relative;
        overflow: hidden;
    }

    .telescope-assembly {
        position: relative;
        width: 140px;
        height: 140px;
        margin-bottom: 2rem;
    }

    /* Outer brass ring with degree marks */
    .brass-ring {
        position: absolute;
        inset: 0;
        border: 6px solid #d4af37;
        border-radius: 50%;
        box-shadow:
            0 0 20px rgba(212, 175, 55, 0.3),
            inset 0 0 15px rgba(212, 175, 55, 0.1);
    }

    .degree-mark {
        position: absolute;
        top: 0;
        left: 50%;
        width: 2px;
        height: 50%;
        transform-origin: bottom center;
    }

    .tick {
        width: 2px;
        height: 8px;
        background: #d4af37;
        opacity: 0.5;
        margin: 0 auto;
    }

    /* Rotating inner lens */
    .telescope-lens {
        position: absolute;
        top: 10px;
        left: 10px;
        right: 10px;
        bottom: 10px;
        border-radius: 50%;
        background: radial-gradient(circle, #0d1117 0%, #09090b 100%);
        transition: transform 0.15s ease-out;
        overflow: hidden;
    }

    /* Iris shutter blades */
    .iris {
        position: absolute;
        inset: 0;
        --open: 0;
    }

    .iris-blade {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
        transform-origin: 0 0;
        transform: rotate(calc(var(--i) * 60deg)) translateY(calc(-30px + var(--open) * 30px));
        opacity: 0.7;
        transition: transform 0.3s ease-out;
    }

    /* Glass reflection */
    .glass-reflection {
        position: absolute;
        top: 15%;
        left: 15%;
        width: 30%;
        height: 20%;
        background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, transparent 100%);
        border-radius: 50%;
        transform: rotate(-30deg);
    }

    /* Crosshair */
    .crosshair {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .cross-h, .cross-v {
        position: absolute;
        background: rgba(212, 175, 55, 0.3);
    }

    .cross-h {
        width: 100%;
        height: 1px;
    }

    .cross-v {
        width: 1px;
        height: 100%;
    }

    .center-dot {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        background: #d4af37;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 8px rgba(212, 175, 55, 0.6);
    }

    /* Status text */
    .status {
        text-align: center;
        margin-bottom: 1.5rem;
    }

    .vintage-text {
        text-transform: uppercase;
        letter-spacing: 2px;
        font-size: 0.8rem;
        animation: blink 1.5s ease-in-out infinite;
        margin: 0 0 0.5rem;
    }

    @keyframes blink {
        50% { opacity: 0.5; }
    }

    .percentage {
        font-size: 1.5rem;
        font-weight: 700;
        color: #d4af37;
        text-shadow: 0 0 10px rgba(212, 175, 55, 0.4);
    }

    /* Static noise visualization bar */
    .static-bar-container {
        display: flex;
        gap: 2px;
        align-items: flex-end;
        height: 16px;
        opacity: 0.4;
    }

    .static-bar {
        width: 3px;
        background: #d4af37;
        border-radius: 1px;
        animation: flicker 0.3s ease-in-out infinite alternate;
    }

    @keyframes flicker {
        from { height: 2px; opacity: 0.3; }
        to { height: 14px; opacity: 0.7; }
    }
</style>
