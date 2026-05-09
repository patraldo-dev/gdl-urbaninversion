// API endpoint that generates Severo Díaz Galindo's narration
// Server-side TTS via Workers AI + vintage radio metadata
// Frontend applies Web Audio filters for the 1920s effect

import { getNarrator } from '$lib/scripts.js';

export async function GET({ url, platform }) {
    const scene = url.searchParams.get('scene') || 'welcome';
    const anchorId = url.searchParams.get('anchor') || 'iam';
    const userQuestion = url.searchParams.get('q');
    const ai = platform?.env?.AI;

    const { narrator, epoch, location, context, scripts } = getNarrator(anchorId);

    let text;
    if (userQuestion && ai) {
        try {
            const response = await ai.run('@cf/mistralai/mistral-small-3.1-24b-instruct', {
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: userQuestion },
                ],
                max_tokens: 150,
            });
            const raw = typeof response === 'string' ? response : (response?.response || '');
            text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        } catch {
            text = scripts[scene] || scripts.welcome;
        }
    } else {
        text = scripts[scene] || scripts.welcome;
    }

    if (ai) {
        try {
            const ttsResponse = await ai.run('@cf/myshell-ai/melotts', {
                text: text.slice(0, 500),
                language: 'es',
            });
            if (ttsResponse && ttsResponse.audio) {
                return new Response(ttsResponse.audio, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Cache-Control': 'public, max-age=3600',
                        'X-Narrator': narrator,
                        'X-Scene': scene,
                        'X-Radio-Effect': 'enabled',
                        'X-Epoch': String(epoch),
                        'X-Location': location,
                    },
                });
            }
        } catch {
            // fall through to text
        }
    }

    return new Response(JSON.stringify({
        text,
        narrator,
        scene,
        epoch,
        radioEffect: true,
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
