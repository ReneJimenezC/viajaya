// Confirmación de la reserva (CU-03 paso 9). La reserva llega desde la cotización en el
// "estado" de la navegación (no en la URL: el código es el secreto de la reserva, N-4).
// En cuanto llega, se copia a la memoria de esta página y se BORRA del historial del navegador:
// así, en una computadora compartida, la siguiente persona no puede volver con "atrás" y ver
// el código y el correo. Por eso, si se recarga la página, la confirmación ya no aparece
// (el aviso "Guarda tu código" lo advierte y "Mi reserva" permite consultarla otra vez).

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Ticket } from '../../components/Ticket';
import { Alert } from '../../components/ui/Alert';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { Reservation } from '../../services/types';

// Revisa que lo recibido tenga forma de reserva antes de usarlo
function readReservation(state: unknown): Reservation | null {
  if (typeof state !== 'object' || state === null || !('reservation' in state)) return null;
  const reservation = (state as { reservation: unknown }).reservation;
  if (typeof reservation !== 'object' || reservation === null) return null;
  return typeof (reservation as { code?: unknown }).code === 'string' ? (reservation as Reservation) : null;
}

export function ConfirmationPage() {
  useDocumentTitle('Reserva confirmada');
  const location = useLocation();
  const navigate = useNavigate();
  // useState con función: se lee el estado de la navegación UNA sola vez, al abrir la página
  const [reservation] = useState(() => readReservation(location.state));

  // Borra la reserva del historial (misma dirección, estado vacío)
  useEffect(() => {
    if (location.state !== null) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (!reservation) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold">No hay una reserva para mostrar</h1>
        <p>
          Si ya reservaste, puedes ver tu reserva en{' '}
          <Link to="/mi-reserva" className="font-semibold text-bosque underline">
            Mi reserva
          </Link>{' '}
          con tu código y tu correo.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="no-print">
        <h1 className="text-3xl font-bold sm:text-4xl">¡Reserva confirmada!</h1>
        <p className="mt-2 text-lg">
          Tu pago fue aprobado. La agencia revisará la reserva y la aprobará; puedes ver su estado en «Mi reserva».
        </p>
      </div>
      <Ticket reservation={reservation} />
      <Alert tone="warning" title="Guarda tu código" className="no-print">
        No te lo enviamos por correo y esta pantalla no se vuelve a mostrar si la recargas o la cierras. Cópialo,
        imprímelo o tómale una foto ahora.
      </Alert>
      <div className="no-print flex flex-wrap gap-3">
        <Link
          to="/mi-reserva"
          className="inline-flex min-h-11 items-center rounded-lg border border-bosque bg-papel px-5 py-2 font-semibold text-bosque hover:bg-celeste-claro"
        >
          Ir a Mi reserva
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-lg px-5 py-2 font-semibold text-bosque underline">
          Buscar otra excursión
        </Link>
      </div>
    </div>
  );
}