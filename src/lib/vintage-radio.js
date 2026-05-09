// src/lib/vintage-radio.js
// Applies 1920s radio effect to audio using Web Audio API
// Band-pass filter + distortion + vinyl crackle + slight reverb

let audioCtx = null;

/**
 * Apply vintage radio effect to an Audio element
 * Returns the modified audio context for cleanup
 */
export function applyRadioEffect(audioElement) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const source = audioCtx.createMediaElementSource(audioElement);

    // 1. Band-pass filter (telephone/radio quality: 300Hz - 3kHz)
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1800;
    bandpass.Q.value = 0.8;

    // 2. High-pass to remove rumble
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 300;

    // 3. Low-pass to cut highs (muffled radio)
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3200;

    // 4. Slight distortion (tube warmth)
    const distortion = audioCtx.createWaveShaper();
    distortion.curve = makeDistortionCurve(20);
    distortion.oversample = '4x';

    // 5. Gain (normalize)
    const gain = audioCtx.createGain();
    gain.gain.value = 1.2;

    // 6. Vinyl crackle noise
    const crackleGain = audioCtx.createGain();
    crackleGain.gain.value = 0.04;
    const crackle = createCrackleNoise(audioCtx);

    // Connect chain
    source.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(distortion);
    distortion.connect(gain);
    gain.connect(audioCtx.destination);

    // Mix in crackle
    crackle.connect(crackleGain);
    crackleGain.connect(audioCtx.destination);

    return {
        ctx: audioCtx,
        crackle,
        cleanup() {
            crackle.stop();
            source.disconnect();
            bandpass.disconnect();
            highpass.disconnect();
            lowpass.disconnect();
            distortion.disconnect();
            gain.disconnect();
            crackleGain.disconnect();
        }
    };
}

function makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}

function createCrackleNoise(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        // Random crackle pops
        if (Math.random() < 0.002) {
            data[i] = (Math.random() - 0.5) * 0.8;
        } else {
            data[i] = (Math.random() - 0.5) * 0.02; // gentle noise floor
        }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    return source;
}
