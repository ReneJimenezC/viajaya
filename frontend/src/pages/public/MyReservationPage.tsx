// Mi reserva: consulta (RF-04, CU-04), cambio de fecha (RF-05, CU-05) y cancelación (RF-06, CU-06).
// El código y el correo viven solo en la memoria de esta página: nunca en la URL ni en el
// navegador (N-4: con código + correo cualquiera podría cancelar la reserva).
// Si llegan desde "¿Ya tienes una reserva?" de la portada (estado de la navegación), se copian a
// la memoria, se borran del historial del navegador y se consulta de inmediato.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ReservationDetails } from '../../components/ReservationDetails';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextField } from '../../components/ui/Field';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusOnChange } from '../../hooks/useFocusOnChange';
import { ApiError, errorMessage } from '../../services/api-client';
import { cancelReservation, lookupReservation, rescheduleReservation } from '../../services/public-api';
import type { Reservation, ReservationAccess } from '../../services/types';
import { firstTravelDate, formatColones, formatTravelDate, lastChangeDate, todayInCostaRica } from '../../utils/format';
import { lookupFormSchema, newDateFormSchema, toFieldErrors, type FieldErrors } from '../../utils/validation';

// Datos que manda la portada por el estado de la navegación; null si no hay o no son válidos
function lookupFromState(state: unknown): ReservationAccess | null {
  const lookup = typeof state === 'object' && state !== null ? (state as { lookup?: unknown }).lookup : undefined;
  const result = lookupFormSchema.safeParse(lookup);
  return result.success ? result.data : null;
}

export function MyReservationPage() {
  useDocumentTitle('Mi reserva');
  const location = useLocation();
  const navigate = useNavigate();
  // Se lee una sola vez, al abrir la página (useState guarda el primer valor)
  const [pendingLookup] = useState(() => lookupFromState(location.state));
  const startedRef = useRef(false);

  // ----- Consulta -----
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [lookupErrors, setLookupErrors] = useState<FieldErrors>({});
  const [lookupProblem, setLookupProblem] = useState('');
  const [searching, setSearching] = useState(false);

  // Datos ya validados con los que se encontró la reserva (para cambiar o cancelar después)
  const [access, setAccess] = useState<ReservationAccess | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [notice, setNotice] = useState('');

  // ----- Cambio de fecha -----
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  // ----- Cancelación -----
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionProblem, setActionProblem] = useState('');

  // Tras cambiar la fecha o cancelar, el foco va al mensaje con el resultado
  const messagesRef = useRef<HTMLDivElement>(null);
  useFocusOnChange(messagesRef, notice || actionProblem);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    setLookupProblem('');
    const result = lookupFormSchema.safeParse({ code, customerEmail: email });
    if (!result.success) {
      setLookupErrors(toFieldErrors(result.error));
      return;
    }
    await runLookup(result.data);
  }

  // Consulta la reserva con datos ya validados (CU-04 pasos 5 y 6)
  async function runLookup(data: ReservationAccess) {
    setLookupErrors({});
    setLookupProblem('');
    setSearching(true);
    try {
      const found = await lookupReservation(data);
      setAccess(data);
      setReservation(found);
      setNotice('');
      setActionProblem('');
      setRescheduling(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setLookupErrors({ code: error.fieldError('code'), customerEmail: error.fieldError('customerEmail') });
      }
      // CU-04 5a: el mensaje exacto lo da la API ("No se encontró una reserva activa...")
      setLookupProblem(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  // Datos que vinieron de la portada: se borran del historial (N-4) y se consulta una vez.
  // startedRef evita una segunda consulta cuando React (modo estricto) repite el efecto.
  useEffect(() => {
    if (!pendingLookup || startedRef.current) return;
    startedRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    setCode(pendingLookup.code);
    setEmail(pendingLookup.customerEmail);
    void runLookup(pendingLookup);
    // [] = solo al abrir la página
  }, []);

  // Vuelve al formulario para consultar otra reserva (borra de la memoria la anterior)
  function startOver() {
    setAccess(null);
    setReservation(null);
    setCode('');
    setEmail('');
    setNotice('');
    setActionProblem('');
    setRescheduling(false);
  }

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();
    if (!access || !reservation) return;
    setActionProblem('');
    const result = newDateFormSchema.safeParse({ travelDate: newDate });
    if (!result.success) {
      setDateError(toFieldErrors(result.error).travelDate ?? 'Elige una fecha válida');
      return;
    }
    if (result.data.travelDate === reservation.travelDate) {
      setDateError('La nueva fecha debe ser distinta de la actual');
      return;
    }
    setDateError('');
    setSavingDate(true);
    try {
      const updated = await rescheduleReservation(access, result.data.travelDate);
      setReservation(updated);
      setRescheduling(false);
      setNewDate('');
      setNotice(`Listo: tu viaje ahora es el ${formatTravelDate(updated.travelDate)}.`);
    } catch (error) {
      // 400 (fecha) y 409 (sin cupo, CU-05 8a) se muestran junto al campo; el resto, arriba
      if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
        setDateError(error.fieldError('travelDate') ?? error.message);
      } else {
        setActionProblem(errorMessage(error));
        setRescheduling(false);
      }
    } finally {
      setSavingDate(false);
    }
  }

  async function handleCancel() {
    if (!access) return;
    setActionProblem('');
    setCancelling(true);
    try {
      const updated = await cancelReservation(access);
      setReservation(updated);
      setNotice('Tu reserva fue cancelada y los cupos quedaron libres para otras personas.');
    } catch (error) {
      // CU-06 2a: con 48 horas o menos la API responde 422 con el motivo
      setActionProblem(errorMessage(error));
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  // ---------- Sin reserva consultada: el formulario (CU-04 pasos 1 a 3) ----------
  if (!reservation) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Mi reserva</h1>
          <p className="mt-2">Escribe el código que recibiste al reservar y el correo que usaste.</p>
        </div>
        {lookupProblem && <Alert tone="error">{lookupProblem}</Alert>}
        <form onSubmit={handleLookup} noValidate className="space-y-4 rounded-xl border border-musgo bg-papel p-5 sm:p-6">
          <TextField
            label="Código de reserva"
            hint="Ejemplo: VY-F57NXNW9"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={lookupErrors.code}
            required
          />
          <TextField
            label="Correo electrónico"
            name="customerEmail"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={lookupErrors.customerEmail}
            required
          />
          <Button type="submit" loading={searching} loadingText="Buscando…">
            Buscar mi reserva
          </Button>
        </form>
        <p className="text-basalto-suave">
          ¿Todavía no tienes una reserva?{' '}
          <Link to="/" className="font-semibold text-bosque underline">
            Busca una excursión
          </Link>
          .
        </p>
      </div>
    );
  }

  // ---------- Reserva encontrada (CU-04 paso 6) ----------
  const active = reservation.status !== 'Cancelada';
  // ¿Sigue abierta la ventana de RN-02? (informativo: la API decide, y aplica la excepción N-3)
  const windowOpen = todayInCostaRica() <= lastChangeDate(reservation.travelDate);
  const cancelledByRejectedPayment = reservation.status === 'Cancelada' && reservation.payment.status === 'Rechazado';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Mi reserva</h1>
        <Button variant="ghost" onClick={startOver}>
          Consultar otra reserva
        </Button>
      </div>

      <div ref={messagesRef} tabIndex={-1} className="space-y-4 outline-none">
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionProblem && <Alert tone="error">{actionProblem}</Alert>}
      </div>

      {/* N-8: la consulta muestra la reserva que canceló la agencia, para que se sepa qué pasó */}
      {!active && !notice && (
        <Alert tone="warning" title="Reserva cancelada">
          {cancelledByRejectedPayment
            ? 'La agencia canceló esta reserva porque el pago no fue aprobado.'
            : 'La agencia canceló esta reserva.'}{' '}
          Si tienes dudas, comunícate con ViajaYa.
        </Alert>
      )}

      <ReservationDetails reservation={reservation} />

      {active && (
        <section aria-labelledby="changes-title" className="space-y-4 rounded-xl border border-musgo bg-papel p-5 sm:p-6">
          <h2 id="changes-title" className="text-2xl font-bold">
            Cambiar o cancelar
          </h2>
          <p>
            {windowOpen ? (
              <>
                Puedes cambiar la fecha o cancelar hasta el{' '}
                <strong>{formatTravelDate(lastChangeDate(reservation.travelDate))}</strong>: deben faltar más de 48 horas
                para el viaje. Al cambiar la fecha, el monto no cambia.
              </>
            ) : (
              <>
                Ya faltan 48 horas o menos para el viaje, así que no se puede cambiar la fecha ni cancelar. Si la agencia
                movió tu viaje a esta fecha, todavía puedes cancelarlo.
              </>
            )}
          </p>

          {!rescheduling && (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setRescheduling(true);
                  setDateError('');
                }}
              >
                Cambiar fecha
              </Button>
              <Button variant="danger" onClick={() => setConfirmingCancel(true)}>
                Cancelar reserva
              </Button>
            </div>
          )}

          {rescheduling && (
            <form onSubmit={handleReschedule} noValidate className="space-y-4">
              <TextField
                label="Nueva fecha del viaje"
                hint={`Fecha actual: ${formatTravelDate(reservation.travelDate)}`}
                name="travelDate"
                type="date"
                min={firstTravelDate()}
                value={newDate}
                onChange={(event) => setNewDate(event.target.value)}
                error={dateError}
                required
                autoFocus
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={savingDate} loadingText="Cambiando la fecha…">
                  Guardar nueva fecha
                </Button>
                <Button variant="ghost" onClick={() => setRescheduling(false)} disabled={savingDate}>
                  No cambiar la fecha
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* CU-06 pasos 3 y 4: resumen y confirmación antes de cancelar */}
      <ConfirmDialog
        open={confirmingCancel}
        title="¿Cancelar esta reserva?"
        confirmText="Sí, cancelar la reserva"
        confirmVariant="danger"
        loading={cancelling}
        loadingText="Cancelando…"
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      >
        <p>
          {reservation.destination.name}, {formatTravelDate(reservation.travelDate)}, {reservation.quote.people}{' '}
          {reservation.quote.people === 1 ? 'persona' : 'personas'}, {formatColones(reservation.quote.total)}.
        </p>
        <p>Los cupos quedarán libres para otras personas. Esta acción no se puede deshacer.</p>
      </ConfirmDialog>
    </div>
  );
}