// Spatial audio for the Time Capsule
// Generates all SFX procedurally — no external files needed

let audioCtx = null;

function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

/**
 * Create a spatial panner at a given position
 */
export function createSpatialPanner(position = { x: 0, y: 0, z: -2 }) {
    const ctx = getCtx();
    const panner = new PannerNode(ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        positionX: position.x,
        positionY: position.y,
        positionZ: position.z,
        refDistance: 1,
        maxDistance: 15,
        rolloffFactor: 1,
    });
    return panner;
}

/**
 * Update the listener position (user's head in 3D space)
 */
export function updateListenerPosition(camera) {
    const ctx = getCtx();
    const listener = ctx.listener;
    if (camera.position) {
        listener.positionX.value = camera.position.x;
        listener.positionY.value = camera.position.y;
        listener.positionZ.value = camera.position.z;
    }
}

/**
 * Sound 1: Soft ping when capsule appears ("there's something here")
 * A gentle bell tone with reverb
 */
export function playDiscoveryPing() {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Fundamental tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);

    // Harmonic shimmer
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(660, now + 0.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.05, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(gain).connect(ctx.destination);
    osc2.connect(gain2).connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.5);
    osc2.stop(now + 1.0);
}

/**
 * Sound 2: Metallic click-clack of brass cylinder opening
 * Short burst of filtered noise + metallic resonance
 */
export function playBrassOpen() {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Click 1: sharp metallic transient
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(3200, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.03);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    // Resonance: brass ring
    const resonance = ctx.createOscillator();
    resonance.type = 'sine';
    resonance.frequency.setValueAtTime(1200, now + 0.05);
    resonance.frequency.exponentialRampToValueAtTime(600, now + 0.3);

    const resGain = ctx.createGain();
    resGain.gain.setValueAtTime(0, now);
    resGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
    resGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    // Click 2: the "clack" (slightly delayed)
    const click2 = ctx.createOscillator();
    click2.type = 'square';
    click2.frequency.setValueAtTime(2800, now + 0.15);
    click2.frequency.exponentialRampToValueAtTime(600, now + 0.18);

    const click2Gain = ctx.createGain();
    click2Gain.gain.setValueAtTime(0.25, now + 0.15);
    click2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    // Hiss of seal breaking (filtered noise)
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() - 0.5) * 0.4;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 4000;
    noiseFilter.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Connect all
    clickOsc.connect(clickGain).connect(ctx.destination);
    resonance.connect(resGain).connect(ctx.destination);
    click2.connect(click2Gain).connect(ctx.destination);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

    clickOsc.start(now);
    resonance.start(now);
    click2.start(now + 0.15);
    noise.start(now);
    clickOsc.stop(now + 0.5);
    resonance.stop(now + 0.5);
    click2.stop(now + 0.5);
    noise.stop(now + 0.4);
}

/**
 * Sound 3: Antique clock ticking (spatial, loops)
 * Returns { source, gain } for cleanup
 */
export function startClockTicking() {
    const ctx = getCtx();

    const gain = ctx.createGain();
    gain.gain.value = 0.04;

    // Create a repeating tick-tock pattern
    const tickInterval = 0.5; // 1 tick per 0.5s = 120 BPM clock
    const ticksPerLoop = 8;
    const bufferSize = ctx.sampleRate * tickInterval * ticksPerLoop;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let tick = 0; tick < ticksPerLoop; tick++) {
        const offset = Math.floor(tick * tickInterval * ctx.sampleRate);
        const freq = tick % 2 === 0 ? 2500 : 1800; // alternating pitch
        // Sharp tick: 3ms impulse
        for (let i = 0; i < Math.floor(ctx.sampleRate * 0.003); i++) {
            data[offset + i] = Math.sin(2 * Math.PI * freq * i / ctx.sampleRate) *
                               Math.exp(-i / (ctx.sampleRate * 0.001)) * 0.6;
        }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Band-pass to make it sound like an old mechanism
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1.5;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();

    return { source, gain, filter };
}

/**
 * Sound 4: Spatial ping — plays the brass open through a panner
 */
export function playSpatialBrassOpen(position = { x: 0, y: 0, z: -2 }) {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const panner = createSpatialPanner(position);

    // Metallic click through panner
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(3200, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.03);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    clickOsc.connect(gain).connect(panner).connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.5);
}

/**
 * Cleanup all audio
 */
export function cleanupSpatialAudio() {
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
}
