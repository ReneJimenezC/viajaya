// Gestión de reservas (RF-08, RF-09): listado completo (CU-11) y, por cada reserva, aprobar,
// cancelar, eliminar (CU-12 a CU-14), modificar el estado del pago (CU-15 + N-1) y reagendar (N-2a).
// El listado muestra lo que pide CU-11 paso 4: código, destino, fecha, personas, correo y los
// estados de la reserva y del pago. Los filtros son solo de esta pantalla (no llaman a la API).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ManageReservationDialog,
  type ActionResult,
} from '../../components/admin/ManageReservationDialog';
import { Loading } from '../../components/Loading';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAdminSession } from '../../hooks/useAdminSession';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusOnChange } from '../../hooks/useFocusOnChange';
import { listReservations } from '../../services/admin-api';
import { errorMessage } from '../../services/api-client';
import type { AdminReservation, ReservationStatus } from '../../services/types';
import { formatColones, formatShortDate } from '../../utils/format';

type StatusFilter = 'todas' | ReservationStatus;

export function ReservationsPage() {
  useDocumentTitle('Reservas');
  const { send } = useAdminSession();

  const [reservations, setReservations] = useState<AdminReservation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<AdminReservation | null>(null);
  // Al terminar una acción se cierra la ventana: el foco va al mensaje con el resultado
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOnChange(noticeRef, notice);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [text, setText] = useState('');

  const load = useCallback(() => {
    setLoadError('');
    setReservations(null);
    listReservations(send)
      .then(setReservations)
      .catch((error: unknown) => setLoadError(errorMessage(error)));
  }, [send]);

  useEffect(load, [load]);

  // Filtra por estado y por texto (código, correo, nombre o destino), sin distinguir mayúsculas
  const visible = useMemo(() => {
    if (!reservations) return [];
    const needle = text.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (statusFilter !== 'todas' && reservation.status !== statusFilter) return false;
      if (!needle) return true;
      return [reservation.code, reservation.customerEmail, reservation.customerName, reservation.destination.name].some(
        (value) => value.toLowerCase().includes(needle),
      );
    });
  }, [reservations, statusFilter, text]);

  // Lo que devuelve la ventana de gestión: se actualiza la fila (o se quita si se eliminó)
  function handleDone(result: ActionResult) {
    if (result.kind === 'deleted') {
      setReservations((current) => current?.filter((item) => item.id !== result.id) ?? null);
    } else {
      setReservations(
        (current) => current?.map((item) => (item.id === result.reservation.id ? result.reservation : item)) ?? null,
      );
    }
    setNotice(result.message);
    setSelected(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Reservas</h1>
          <p className="text-basalto-suave">De la fecha de viaje más lejana a la más cercana.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          Actualizar listado
        </Button>
      </div>

      <div ref={noticeRef} tabIndex={-1} className="outline-none">
        {notice && <Alert tone="success">{notice}</Alert>}
      </div>

      <div className="grid gap-4 rounded-xl border border-musgo bg-papel p-4 sm:grid-cols-[1fr_16rem]">
        <TextField
          label="Buscar"
          hint="Código, correo, nombre o destino"
          name="buscar"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <SelectField
          label="Estado de la reserva"
          name="estado"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="todas">Todas</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobada">Aprobada</option>
          <option value="Cancelada">Cancelada</option>
        </SelectField>
      </div>

      {loadError && (
        <Alert tone="error">
          {loadError}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Intentar de nuevo
          </button>
        </Alert>
      )}
      {reservations === null && !loadError && <Loading text="Cargando reservas…" />}

      {/* CU-11 4a: no hay reservas */}
      {reservations?.length === 0 && (
        <p className="rounded-xl border border-musgo bg-papel px-5 py-6">Todavía no hay reservas para consultar.</p>
      )}
      {reservations && reservations.length > 0 && (
        <>
          <p role="status" className="text-basalto-suave">
            {visible.length === reservations.length
              ? `${reservations.length} ${reservations.length === 1 ? 'reserva' : 'reservas'}`
              : `${visible.length} de ${reservations.length} reservas coinciden con el filtro`}
          </p>
          {visible.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-musgo bg-papel">
              <table className="w-full min-w-[60rem] text-left">
                <caption className="sr-only">Listado de reservas</caption>
                <thead className="border-b border-musgo bg-neblina">
                  <tr>
                    <th scope="col" className="px-4 py-3">Código</th>
                    <th scope="col" className="px-4 py-3">Destino</th>
                    <th scope="col" className="px-4 py-3">Fecha</th>
                    <th scope="col" className="px-4 py-3 text-right">Personas</th>
                    <th scope="col" className="px-4 py-3">Correo</th>
                    <th scope="col" className="px-4 py-3 text-right">Total</th>
                    <th scope="col" className="px-4 py-3">Reserva</th>
                    <th scope="col" className="px-4 py-3">Pago</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-musgo">
                  {visible.map((reservation) => (
                    <tr key={reservation.id}>
                      <th scope="row" className="px-4 py-3 font-semibold whitespace-nowrap">{reservation.code}</th>
                      <td className="px-4 py-3">{reservation.destination.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(reservation.travelDate)}</td>
                      <td className="px-4 py-3 text-right">{reservation.quote.people}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{reservation.customerEmail}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatColones(reservation.quote.total)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={reservation.status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={reservation.payment.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          className="min-h-9 px-3 py-1"
                          onClick={() => {
                            setNotice('');
                            setSelected(reservation);
                          }}
                        >
                          Gestionar<span className="sr-only"> {reservation.code}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ManageReservationDialog reservation={selected} onClose={() => setSelected(null)} onDone={handleDone} />
    </div>
  );
}