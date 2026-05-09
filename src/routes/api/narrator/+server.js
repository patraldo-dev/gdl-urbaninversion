// API endpoint that generates Severo Díaz Galindo's narration
// Server-side TTS via Workers AI + vintage radio metadata
// Frontend applies Web Audio filters for the 1920s effect

const SEVERO_CONTEXT = `Eres el Ingeniero Severo Díaz Galindo, director del Instituto de Astronomía y Meteorología de Guadalajara desde 1925. Eres el "padre de la meteorología" en Jalisco. Hablas con dignidad y pasión por la ciencia. Estás en 1930, en tu instituto. Respondes siempre en español, con lenguaje de la época. Eres amable pero erudito. Tus respuestas son breves (máximo 3 oraciones).`;

const SEVERO_SCRIPTS = {
    welcome: `¡Bienvenido al Instituto de Astronomía! Soy el Ingeniero Severo Díaz. Estás parado en el corazón científico de Jalisco. Desde 1889, aquí desciframos los secretos del cielo tapatío.`,
    observatory: `Este observatorio ha sido testigo de más de cuarenta años de observaciones celestes. Cada noche, cuando Guadalajara duerme, nosotros velamos.`,
    weather: `La meteorología no es adivinanza, es ciencia. El barómetro no miente, el termómetro no inventa. Los datos son sagrados.`,
    stars: `En una noche despejada desde esta cúpula, puedo ver las Pléyades, Orión, la Osa Mayor. Los antiguos mexicanos ya las nombraban antes que nosotros.`,
    dome: `¿Ves esa cúpula? Ahí es donde el tiempo se detiene para observar el cosmos. El telescopio es nuestro portal a lo infinito.`,
    rain: `Cada gota de lluvia que cae en esta ciudad ha sido medida por mis instrumentos. Y cada tormenta que se avecina, la anunciamos con horas de anticipación.`,
};

export async function GET({ url, platform }) {
    const scene = url.searchParams.get('scene') || 'welcome';
    const userQuestion = url.searchParams.get('q');
    const ai = platform?.env?.AI;

    let text;

    if (userQuestion && ai) {
        // Dynamic response to user question
        try {
            const response = await ai.run('@cf/mistralai/mistral-small-3.1-24b-instruct', {
                messages: [
                    { role: 'system', content: SEVERO_CONTEXT },
                    { role: 'user', content: userQuestion },
                ],
                max_tokens: 150,
            });
            const raw = typeof response === 'string' ? response : (response?.response || '');
            text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        } catch {
            text = SEVERO_SCRIPTS[scene];
        }
    } else {
        text = SEVERO_SCRIPTS[scene] || SEVERO_SCRIPTS.welcome;
    }

    // Try TTS via Workers AI (MeloTTS)
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
                        'X-Narrator': 'Severo-Diaz-Galindo',
                        'X-Scene': scene,
                        'X-Radio-Effect': 'enabled', // Signal to frontend: apply vintage filter
                        'X-Epoch': '1920',
                        'X-Location': 'IAM-GDL',
                    },
                });
            }
        } catch {
            // TTS not available, return text
        }
    }

    // Fallback: return text for Web Speech API
    return new Response(JSON.stringify({
        text,
        narrator: 'Severo Díaz Galindo',
        scene,
        epoch: 1920,
        radioEffect: true,
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
