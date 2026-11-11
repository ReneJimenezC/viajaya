// Pone el título de la pestaña en cada página (WCAG 2.4.2: cada página con un título que la describe).
// Ejemplo: useDocumentTitle('Mi reserva') → "Mi reserva · ViajaYa"

import { useEffect } from 'react';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ViajaYa`;
  }, [title]);
}