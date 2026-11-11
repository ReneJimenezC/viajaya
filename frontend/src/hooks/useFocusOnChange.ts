// Mueve el foco a un elemento cada vez que "value" cambia a algo no vacío.
// Sirve para no dejar el foco "perdido" cuando el botón que se pulsó desaparece (por ejemplo,
// "Cancelar reserva" tras cancelar): el foco pasa al mensaje con el resultado (WCAG 2.4.3).
// El elemento necesita tabIndex={-1} para poder recibir el foco.

import { useEffect, type RefObject } from 'react';

export function useFocusOnChange(target: RefObject<HTMLElement | null>, value: unknown): void {
  useEffect(() => {
    if (value) target.current?.focus();
  }, [value, target]);
}