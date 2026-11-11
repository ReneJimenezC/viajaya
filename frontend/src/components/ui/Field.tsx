// Campo de formulario accesible: etiqueta + control + ayuda + error (WCAG 1.3.1, 3.3.1, 3.3.2).
// - La etiqueta queda unida al control por su id (al hacer clic en ella se enfoca el campo).
// - El error se anuncia (aria-invalid + aria-describedby) y se escribe en texto, no solo en rojo.
// Uso: <TextField label="Correo" name="customerEmail" type="email" error={errors.customerEmail} />

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  // Marca visible de campo opcional (los obligatorios son la mayoría)
  optional?: boolean;
  children: ReactNode;
}

// Ids de la ayuda y del error, para describir el control. Ejemplo: 'r1-hint r1-error'
function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

const CONTROL_CLASSES =
  'mt-1 block w-full rounded-md border bg-papel px-3 py-2 text-basalto placeholder:text-basalto-suave/70';

function controlBorder(error?: string): string {
  // basalto-suave: el borde del campo debe contrastar 3:1 o más con el fondo (WCAG 1.4.11)
  return error ? 'border-error border-2' : 'border-basalto-suave';
}

function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
        {optional && <span className="ml-1 font-normal text-basalto-suave">(opcional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-basalto-suave">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  // En React 19 "ref" es una prop normal: permite mover el foco a este campo
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, optional, id, className = '', ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASSES} ${controlBorder(error)} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

export function TextAreaField({ label, hint, error, optional, id, className = '', ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASSES} ${controlBorder(error)} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export function SelectField({ label, hint, error, id, className = '', children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASSES} ${controlBorder(error)} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}