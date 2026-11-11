// Botón único de la app (SAD 3.4: components/ = componentes reutilizables).
// Variantes: primary (acción principal), secondary, danger (acciones que no se deshacen), ghost.
// Con loading=true se desactiva y anuncia "procesando", así un doble clic no envía dos veces.

import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-bosque text-white hover:bg-bosque-oscuro border border-bosque',
  secondary: 'bg-papel text-bosque border border-bosque hover:bg-celeste-claro',
  danger: 'bg-error text-white border border-error hover:brightness-90',
  ghost: 'bg-transparent text-bosque border border-transparent hover:bg-celeste-claro underline-offset-4',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  // Texto que se muestra mientras loading es true. Ejemplo: "Reservando…"
  loadingText?: string;
  // En React 19 "ref" es una prop normal: permite mover el foco a este botón
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  loading = false,
  loadingText,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  );
}