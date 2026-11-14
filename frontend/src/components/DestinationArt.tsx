// Dibujos de las tarjetas de destino (estética propuesta por el equipo el 10/11).
// El backend no guarda imágenes de los destinos, así que el dibujo se elige por palabras del
// nombre, el lugar o la descripción. Ejemplo: "Playa y parque nacional" → playa.
// Son dibujos propios en SVG (sin fotos ni imágenes de terceros) y decorativos (aria-hidden):
// el nombre del destino ya está escrito en la tarjeta.
// Animación (decisión del 11/11, opción 1): las piezas con clase "art-…" se mueven SOLO mientras
// el mouse está sobre la tarjeta o el foco está dentro de ella (CSS en styles/index.css). Así no
// hay movimiento automático continuo (WCAG 2.2.2) y con "reducir movimiento" no se anima (2.3.3).

import type { PublicDestination } from '../services/types';

export type ArtKind = 'playa' | 'volcan' | 'bosque' | 'agua' | 'montana';

// Palabras que eligen cada dibujo, en orden de prioridad (sin tildes y en minúscula)
const KEYWORDS: [ArtKind, RegExp][] = [
  ['volcan', /volcan|crater|arenal|poas|irazu|rincon de la vieja|termal/],
  ['playa', /playa|mar\b|surf|bahia|isla|arrecife/],
  ['agua', /rio|lago|laguna|catarata|canal|tortuga|manglar|rafting/],
  ['bosque', /bosque|selva|nuboso|canopy|sendero|parque|jardin|cafe/],
];

// Quita tildes y pasa a minúscula. Ejemplo: "Volcán Poás" → "volcan poas"
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Elige el dibujo de un destino. Si ninguna palabra coincide, montañas (vale para cualquiera)
export function artKindFor(destination: Pick<PublicDestination, 'name' | 'place' | 'description'>): ArtKind {
  const text = normalize(`${destination.name} ${destination.place} ${destination.description ?? ''}`);
  return KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'montana';
}

export function DestinationArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 140"
      preserveAspectRatio="xMidYMid slice"
      className={`block h-full w-full ${className}`}
    >
      {kind === 'playa' && (
        <>
          <rect width="320" height="140" fill="#CDEBF1" />
          <circle className="art-rise" cx="250" cy="42" r="18" fill="#FFFFFF" />
          <rect y="78" width="320" height="34" fill="#2A97AE" />
          <path
            className="art-drift"
            d="M0 86q20-6 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0"
            fill="none"
            stroke="#9EDCE6"
            strokeWidth="3"
          />
          <path
            className="art-drift art-slow"
            d="M0 98q20-6 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0"
            fill="none"
            stroke="#7FCFDB"
            strokeWidth="3"
          />
          <path d="M0 112q80-16 160-4t160-6v38H0z" fill="#F1D9A8" />
        </>
      )}
      {kind === 'volcan' && (
        <>
          <rect width="320" height="140" fill="#C7E0EE" />
          <circle className="art-smoke" cx="166" cy="38" r="7" fill="#FFFFFF" opacity="0.9" />
          <circle className="art-smoke art-late" cx="174" cy="30" r="9" fill="#FFFFFF" opacity="0.8" />
          <path d="M70 140L148 46h24l78 94z" fill="#244B6B" />
          <path d="M148 46h24l-6 10h-12z" fill="#16324B" />
          <path d="M0 120q80-18 160-6t160-8v34H0z" fill="#4E9B78" />
        </>
      )}
      {kind === 'bosque' && (
        <>
          <rect width="320" height="140" fill="#D6EDE3" />
          <path d="M0 90q80-40 160-10t160-14v74H0z" fill="#6DB08A" />
          <path d="M0 108q90-30 170-6t150-10v48H0z" fill="#3E8A62" />
          {[30, 70, 230, 270].map((x) => (
            <path key={x} className="art-sway" d={`M${x} 112l14-34 14 34z`} fill="#22603F" />
          ))}
          {[110, 140, 180, 200].map((x) => (
            <circle key={x} className="art-twinkle" cx={x} cy={118 + (x % 3)} r="3" fill="#F4E3A1" />
          ))}
        </>
      )}
      {kind === 'agua' && (
        <>
          <rect width="320" height="140" fill="#D3ECF1" />
          <path d="M0 76q60-30 120-8t110-10 90 4v18H0z" fill="#4E9B78" />
          <rect y="80" width="320" height="60" fill="#2E8FA6" />
          <path
            className="art-drift art-wide"
            d="M0 96q30-5 60 0t60 0 60 0 60 0 60 0 60 0"
            fill="none"
            stroke="#8AD3DF"
            strokeWidth="3"
          />
          <g className="art-bob">
            <path d="M140 108h46l-8 9h-30z" fill="#FFFFFF" />
            <path d="M160 108v-16l12 16z" fill="#FFFFFF" />
          </g>
        </>
      )}
      {kind === 'montana' && (
        <>
          <rect width="320" height="140" fill="#CFE4EE" />
          <circle cx="70" cy="40" r="14" fill="#FFFFFF" />
          <g className="art-cloud" fill="#FFFFFF" opacity="0.85">
            <ellipse cx="200" cy="30" rx="22" ry="8" />
            <ellipse cx="214" cy="24" rx="12" ry="8" />
          </g>
          <path d="M40 140l80-80 50 50 40-30 90 60z" fill="#2F6D86" />
          <path d="M120 60l18 18-12-4-6 8-8-8z" fill="#EEF3F6" />
          <path d="M0 124q80-14 160-4t160-6v26H0z" fill="#4E9B78" />
        </>
      )}
    </svg>
  );
}