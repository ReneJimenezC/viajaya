// Paisaje de la portada: luna, montañas en capas y un ave (dibujo propio en SVG, decorativo).
// Va detrás del texto de la portada, del lado derecho, como en el diseño del equipo.

export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 320"
      preserveAspectRatio="xMaxYMax slice"
      className={`pointer-events-none ${className}`}
    >
      <circle cx="430" cy="90" r="38" fill="#DDF2F4" opacity="0.9" />
      <circle cx="430" cy="90" r="52" fill="#DDF2F4" opacity="0.12" />
      <path d="M300 120q12-8 24 0q12-8 24 0" fill="none" stroke="#DDF2F4" strokeWidth="4" strokeLinecap="round" />
      <path d="M150 320L330 150l90 80 70-60 110 150z" fill="#1F6F78" />
      <path d="M330 150l26 24-14-4-12 12-10-10-14 6z" fill="#DDF2F4" opacity="0.8" />
      <path d="M0 320q120-90 260-60t220-40 120 30v70z" fill="#2A8F7A" />
      <path d="M0 320q140-50 300-30t300-20v50z" fill="#3AA489" />
    </svg>
  );
}

// Versión corta para celulares y tabletas: solo las colinas al pie de la portada, para que la
// luna y las montañas no queden detrás del texto (el texto blanco perdería contraste)
export function HeroHills({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 80"
      preserveAspectRatio="none"
      className={`pointer-events-none ${className}`}
    >
      <path d="M0 80q120-60 260-40t220-30 120 20v50z" fill="#2A8F7A" />
      <path d="M0 80q140-30 300-18t300-14v32z" fill="#3AA489" />
    </svg>
  );
}