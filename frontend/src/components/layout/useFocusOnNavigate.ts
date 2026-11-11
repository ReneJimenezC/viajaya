// Al cambiar de página en una SPA, el navegador no mueve el foco (como sí pasa al cargar una
// página nueva). Este hook lo lleva al contenido principal, así quien usa teclado o lector de
// pantalla empieza a leer la página nueva y no se queda en el enlace que pulsó (WCAG 2.4.3).

import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

export function useFocusOnNavigate(target: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  // Última dirección vista. Se compara con ella (y no con un "es la primera vez") porque en
  // desarrollo React ejecuta los efectos dos veces: así la carga inicial nunca mueve el foco.
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    target.current?.focus();
  }, [pathname, target]);
}