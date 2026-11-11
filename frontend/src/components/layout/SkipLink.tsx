// Enlace "Saltar al contenido": el primero que alcanza el teclado (Tab). Permite pasar por
// encima del menú en cada página (WCAG 2.4.1). Solo se ve cuando recibe el foco.

export function SkipLink() {
  return (
    <a
      href="#contenido"
      className="sr-only rounded-md bg-bosque px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >
      Saltar al contenido
    </a>
  );
}