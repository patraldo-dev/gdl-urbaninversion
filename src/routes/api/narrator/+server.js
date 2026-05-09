// API endpoint that generates Severo Díaz Galindo's narration
// Uses Cloudflare Workers AI for text generation + TTS

const SEVERO_CONTEXT = `Eres el Ingeniero Severo Díaz Galindo, director del Instituto de Astronomía y Meteorología de Guadalajara desde 1925. Eres el "padre de la meteorología" en Jalisco. Hablas con dignidad y pasión por la ciencia. Estás en 1930, en tu instituto. Respondes siempre en español, con lenguaje de la época. Eres amable pero erudito.`;

const SEVERO_SCRIPTS = {
    welcome: `¡Bienvenido al Instituto de Astronomía! Soy el Ingeniero Severo Díaz. Estás parado en el corazón científico de Jalisco. Desde 1889, aquí desciframos los secretos del cielo tapatío. No solo medimos la lluvia, miramos las estrellas. ¿Ves esa cúpula? Ahí es donde el tiempo se detiene para observar el cosmos.`,
    observatory: `Este observatorio ha sido testigo de más de cuarenta años de observaciones celestes. Cada noche, cuando Guadalajara duerme, nosotros velamos. Los cometas no esperan, ni las tormentas avisan. Hay que estar siempre alerta.`,
    weather: `La meteorología no es adivinanza, es ciencia. Cada gota de lluvia que cae en esta ciudad ha sido medida por mis instrumentos. El barómetro no miente, el termómetro no inventa. Los datos son sagrados.`,
    stars: `¿Mira arriba? En una noche despejada desde esta cúpula, puede ver las Pléyades, Orión, la Osa Mayor. Cada estrella tiene historia, y cada constelación cuenta algo sobre quiénes somos. Los antiguos mexicanos ya las nombraban antes que nosotros.`,
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
                max_tokens: 200,
            });
            text = typeof response === 'string' ? response : (response.response || SEVERO_SCRIPTS[scene]);
        } catch {
            text = SEVERO_SCRIPTS[scene];
        }
    } else {
        text = SEVERO_SCRIPTS[scene] || SEVERO_SCRIPTS.welcome;
    }

    // Try TTS via Workers AI
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
                    },
                });
            }
        } catch {
            // TTS failed, return text
        }
    }

    // Fallback: return text for Web Speech API
    return new Response(JSON.stringify({ text, narrator: 'Severo Díaz Galindo', scene }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
