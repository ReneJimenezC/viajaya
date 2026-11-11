// Etiqueta del estado de una reserva o de un pago (CU-04 paso 6, CU-11 paso 4).
// El texto dice el estado; el color solo lo refuerza (WCAG 1.4.1).

import type { PaymentStatus, ReservationStatus } from '../../services/types';

const STYLES: Record<ReservationStatus | PaymentStatus, string> = {
  Pendiente: 'bg-aviso-claro text-aviso border-aviso',
  Aprobada: 'bg-exito-claro text-exito border-exito',
  Aprobado: 'bg-exito-claro text-exito border-exito',
  Cancelada: 'bg-error-claro text-error border-error',
  Rechazado: 'bg-error-claro text-error border-error',
};

interface StatusBadgeProps {
  status: ReservationStatus | PaymentStatus;
  // Texto que se lee antes del estado, para los lectores de pantalla. Ejemplo: "Pago:"
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-block rounded-full border px-3 py-0.5 text-sm font-semibold ${STYLES[status]}`}>
      {label && <span className="sr-only">{label} </span>}
      {status}
    </span>
  );
}