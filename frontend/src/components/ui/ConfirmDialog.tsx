// Ventana de confirmación para acciones importantes (CU-06 paso 3, CU-10 paso 5, CU-12 a CU-15:
// "El sistema solicita confirmar la operación"). Usa el <dialog> nativo del navegador:
// atrapa el foco del teclado, se cierra con Esc y devuelve el foco al botón que la abrió.
// Si la persona cancela, no se hace nada (excepciones 4a/6a/7a de esos CU).

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  // Contenido: el resumen de lo que se va a hacer y, si aplica, campos (motivo, fecha...)
  children: ReactNode;
  confirmText: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmText,
  confirmVariant = 'primary',
  loading = false,
  loadingText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Abre o cierra el <dialog> cuando cambia "open". showModal() lo muestra encima de todo.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // El formulario permite confirmar con Enter; preventDefault evita que la página se recargue
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Esc dispara "cancel": se avisa al padre en vez de dejar que el navegador lo cierre solo
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-musgo bg-papel p-0 text-basalto shadow-xl backdrop:bg-basalto/50"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <h2 id={titleId} className="text-2xl font-bold">
          {title}
        </h2>
        <div className="space-y-4">{children}</div>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Volver sin cambios
          </Button>
          <Button type="submit" variant={confirmVariant} loading={loading} loadingText={loadingText}>
            {confirmText}
          </Button>
        </div>
      </form>
    </dialog>
  );
}