// Detalle de una reserva para el turista (CU-04 paso 6: destino, fecha, personas, costo total
// y estado). Lo usan la consulta, el cambio de fecha y la cancelación.

import type { Reservation } from '../services/types';
import { formatColones, formatDateTime, formatTravelDate } from '../utils/format';
import { StatusBadge } from './ui/StatusBadge';

export function ReservationDetails({ reservation }: { reservation: Reservation }) {
  const rows: [string, string][] = [
    ['Código', reservation.code],
    ['Destino', `${reservation.destination.name} (${reservation.destination.place})`],
    ['Fecha del viaje', formatTravelDate(reservation.travelDate)],
    ['Personas', String(reservation.quote.people)],
    ['A nombre de', reservation.customerName],
    ['Correo', reservation.customerEmail],
    ['Total pagado', formatColones(reservation.quote.total)],
    ['Tarjeta terminada en', String(reservation.payment.cardLastDigit)],
    ['Reservada el', formatDateTime(reservation.createdAt)],
  ];
  return (
    <div className="rounded-xl border border-musgo bg-papel">
      <div className="flex flex-wrap items-center gap-3 border-b border-musgo px-5 py-4">
        <StatusBadge status={reservation.status} label="Estado de la reserva:" />
        <StatusBadge status={reservation.payment.status} label="Estado del pago:" />
      </div>
      <dl className="divide-y divide-musgo">
        {rows.map(([term, value]) => (
          <div key={term} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-basalto-suave">{term}</dt>
            <dd className="font-semibold break-words sm:text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}