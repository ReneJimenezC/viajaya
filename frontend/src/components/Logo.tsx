// Logotipo de ViajaYa: el nombre ("Ya" resaltado, como en el diseño del equipo) y un trazo de
// río sobre montañas (dibujo propio, sin imágenes de terceros). El dibujo es decorativo
// (aria-hidden): los lectores de pantalla leen solo "ViajaYa".
// onDark: true sobre fondos azul marino (el "Ya" va en celeste); false sobre fondos claros
// (va en verde azulado, porque el celeste sobre blanco no se leería bien).

export function Logo({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" focusable="false">
        <circle cx="16" cy="16" r="15" fill="#0F6E78" />
        <path d="M5 19c4-5 7 3 11-2s7 3 11-2" fill="none" stroke="#5CC6CF" strokeWidth="3" strokeLinecap="round" />
        <path d="M9 12l4-5 3 4 2-2 4 5" fill="none" stroke="#EEF3F6" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span>
        Viaja<span className={onDark ? 'text-celeste' : 'text-bosque'}>Ya</span>
      </span>
    </span>
  );
}