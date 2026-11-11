// Mensaje destacado: error, éxito, aviso o información.
// Los errores usan role="alert" (el lector de pantalla los lee al aparecer, WCAG 4.1.3);
// el resto, role="status" (se leen sin interrumpir). Cada tono lleva además un título en
// texto: el color nunca es la única señal (WCAG 1.4.1).

import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'success' | 'warning' | 'info';

const TONES: Record<AlertTone, { classes: string; title: string }> = {
  error: { classes: 'border-error bg-error-claro', title: 'No se pudo completar' },
  success: { classes: 'border-exito bg-exito-claro', title: 'Listo' },
  warning: { classes: 'border-aviso bg-aviso-claro', title: 'Importante' },
  info: { classes: 'border-celeste bg-celeste-claro', title: 'Para tomar en cuenta' },
};

interface AlertProps {
  tone: AlertTone;
  // Título propio; si no se da, se usa el del tono
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone, title, children, className = '' }: AlertProps) {
  const style = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border-l-4 px-4 py-3 ${style.classes} ${className}`}
    >
      <p className="font-semibold">{title ?? style.title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}