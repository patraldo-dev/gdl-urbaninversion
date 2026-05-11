// Anchor points for GDL cultural tour
// Loaded from D1 via /api/anchors — fallback to static data if fetch fails

const STATIC_ANCHORS = [
    {
        id: 'colegio-san-juan',
        name: 'Antiguo Colegio de San Juan Bautista',
        description: 'Epicentro intelectual donde la ciencia jalisciense empezó a mirar a las estrellas. Las primeras observaciones astronómicas serias de la ciudad se gestaron aquí.',
        lat: 20.6775,
        lon: -103.3444,
        year: 1850,
        narrator: 'Severo Díaz Galindo',
        type: 'observatory',
    },
    {
        id: 'palacio-gobierno',
        name: 'Palacio de Gobierno — El Reloj y la Geografía',
        description: 'Entre 1870 y 1920, centro del poder político y punto de referencia para los ingenieros que trazaban los primeros mapas científicos de Jalisco.',
        lat: 20.6750,
        lon: -103.3465,
        year: 1870,
        narrator: 'Mariano Bárcena',
        type: 'institute',
    },
    {
        id: 'templo-expiatorio',
        name: 'Templo Expiatorio — Ciencia y Gótico',
        description: 'Triunfo de la ingeniería moderna. Adamo Boari y los ingenieros locales elevaron agujas neogóticas con cálculos precisos en una ciudad aún de un solo piso.',
        lat: 20.6751,
        lon: -103.3592,
        year: 1897,
        narrator: 'Ignacio Díaz Morales',
        type: 'memorial',
    },
    {
        id: 'observatorio-morelos',
        name: 'Primer Observatorio (1874)',
        description: 'El profesor Lázaro Pérez instaló el primer registro de observación diaria en su casa particular.',
        lat: 20.6750,
        lon: -103.3500,
        year: 1874,
        narrator: 'Lázaro Pérez',
        type: 'observatory',
    },
    {
        id: 'teatro-degollado',
        name: 'Observatorio del Teatro Degollado',
        description: 'Entre 1901 y 1913, la azotea del Teatro Degollado albergó instrumentos astronómicos modernos.',
        lat: 20.6772,
        lon: -103.3446,
        year: 1906,
        narrator: 'Guía del Teatro',
        type: 'observatory',
    },
    {
        id: 'iam',
        name: 'Instituto de Astronomía y Meteorología',
        description: 'Fundado el 2 de abril de 1889. Severo Díaz Galindo, "padre del clima", lo dirigió desde 1925.',
        lat: 20.67485,
        lon: -103.38429,
        year: 1889,
        narrator: 'Severo Díaz Galindo',
        type: 'institute',
    },
    {
        id: 'casa-severo-diaz',
        name: 'Casa de Severo Díaz Galindo',
        description: 'Donde vivió el "padre de la meteorología" de Jalisco. Placa conmemorativa en la fachada.',
        lat: 20.6756,
        lon: -103.3600,
        year: 1900,
        narrator: 'Severo Díaz Galindo',
        type: 'memorial',
    },
];

// Named export for backward compat with map/tour pages
export const ANCHORS = STATIC_ANCHORS;
export default STATIC_ANCHORS;
