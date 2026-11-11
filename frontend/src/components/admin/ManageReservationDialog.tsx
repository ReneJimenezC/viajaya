// Ventana para gestionar una reserva desde el panel (CU-12 a CU-15 y N-2a). Sigue el orden de los
// casos de uso: el sistema muestra la reserva → el admin elige la acción → completa los datos →
// confirma. "Volver" o Esc no cambian nada (excepciones 6a/7a).
// Las reglas que se muestran aquí (qué acción se permite) son las mismas de la API; si algo
// cambió entretanto, la API decide y su mensaje aparece en la ventana.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAdminSession } from '../../hooks/useAdminSession';
import {
  approveReservation,
  cancelReservationAsAdmin,
  changePaymentStatus,
  deleteReservation,
  rescheduleAsAdmin,
} from '../../services/admin-api';
import { ApiError, errorMessage } from '../../services/api-client';
import { PAYMENT_STATES, type AdminReservation, type PaymentStatus } from '../../services/types';
import { firstTravelDate, formatColones, formatDateTime, formatTravelDate } from '../../utils/format';
import { newDateFormSchema, reasonField } from '../../utils/validation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { SelectField, TextAreaField, TextField } from '../ui/Field';
import { StatusBadge } from '../ui/StatusBadge';

export type ReservationAction = 'approve' | 'cancel' | 'delete' | 'reschedule' | 'payment';

// Resultado que recibe la página: la reserva actualizada, o "eliminada"
export type ActionResult =
  | { kind: 'updated'; reservation: AdminReservation; message: string }
  | { kind: 'deleted'; id: number; message: string };

interface ActionInfo {
  label: string;
  // Motivo por el que no se puede (null = se puede). Mismas reglas que la API.
  blockedBy: (reservation: AdminReservation) => string | null;
}

const ACTIONS: Record<ReservationAction, ActionInfo> = {
  approve: {
    label: 'Aprobar reserva',
    blockedBy: (r) =>
      r.status !== 'Pendiente'
        ? 'Solo se aprueban reservas pendientes.'
        : r.payment.status !== 'Aprobado'
          ? 'El pago todavía no está aprobado.'
          : null,
  },
  reschedule: {
    label: 'Cambiar fecha',
    blockedBy: (r) => (r.status === 'Cancelada' ? 'La reserva está cancelada.' : null),
  },
  payment: {
    label: 'Modificar estado de pago',
    blockedBy: (r) => (r.status === 'Cancelada' ? 'La reserva está cancelada.' : null),
  },
  cancel: {
    label: 'Cancelar reserva',
    blockedBy: (r) => (r.status === 'Cancelada' ? 'La reserva ya está cancelada.' : null),
  },
  delete: {
    label: 'Eliminar reserva',
    blockedBy: (r) => (r.status !== 'Cancelada' ? 'Solo se eliminan reservas canceladas.' : null),
  },
};

const ACTION_ORDER: ReservationAction[] = ['approve', 'reschedule', 'payment', 'cancel', 'delete'];

interface ManageReservationDialogProps {
  reservation: AdminReservation | null;
  onClose: () => void;
  onDone: (result: ActionResult) => void;
}

export function ManageReservationDialog({ reservation, onClose, onDone }: ManageReservationDialogProps) {
  const { send } = useAdminSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const [action, setAction] = useState<ReservationAction | null>(null);
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>('');
  const [errors, setErrors] = useState<{ reason?: string; travelDate?: string; status?: string }>({});
  const [problem, setProblem] = useState('');
  const [working, setWorking] = useState(false);

  // Abre la ventana al recibir una reserva y la cierra al quitarla; cada vez empieza limpia
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (reservation && !dialog.open) {
      setAction(null);
      setProblem('');
      dialog.showModal();
    }
    if (!reservation && dialog.open) dialog.close();
  }, [reservation]);

  // Al elegir una acción o volver, el botón pulsado desaparece: el foco pasa al título de la
  // ventana para no perderse (WCAG 2.4.3)
  useEffect(() => {
    if (dialogRef.current?.open) headingRef.current?.focus();
  }, [action]);

  function chooseAction(next: ReservationAction | null) {
    setAction(next);
    setReason('');
    setNewDate('');
    setPaymentStatus('');
    setErrors({});
    setProblem('');
  }

  function close() {
    if (!working) onClose();
  }

  // Revisa los datos de la acción elegida. Devuelve false si hay algo que corregir.
  function validate(current: AdminReservation): boolean {
    const found: typeof errors = {};
    const reasonRequired = action === 'reschedule' || (action === 'payment' && paymentStatus === 'Rechazado');
    if (reasonRequired || reason.trim()) {
      const checked = reasonField.safeParse(reason);
      if (!checked.success) found.reason = checked.error.issues[0]?.message;
    }
    if (action === 'reschedule') {
      const checked = newDateFormSchema.safeParse({ travelDate: newDate });
      if (!checked.success) found.travelDate = checked.error.issues[0]?.message;
      else if (newDate === current.travelDate) found.travelDate = 'La nueva fecha debe ser distinta de la actual';
    }
    if (action === 'payment' && !paymentStatus) {
      // CU-15 6a: debe elegirse un estado válido
      found.status = 'Elige el nuevo estado del pago';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!reservation || !action || working) return;
    setProblem('');
    if (!validate(reservation)) return;
    setWorking(true);
    try {
      const id = reservation.id;
      let result: ActionResult;
      switch (action) {
        case 'approve': {
          const updated = await approveReservation(send, id, reason);
          result = { kind: 'updated', reservation: updated, message: `Reserva ${updated.code} aprobada.` };
          break;
        }
        case 'cancel': {
          const updated = await cancelReservationAsAdmin(send, id, reason);
          result = { kind: 'updated', reservation: updated, message: `Reserva ${updated.code} cancelada. Su cupo quedó libre.` };
          break;
        }
        case 'delete': {
          await deleteReservation(send, id, reason);
          result = { kind: 'deleted', id, message: `Reserva ${reservation.code} eliminada del listado.` };
          break;
        }
        case 'reschedule': {
          const updated = await rescheduleAsAdmin(send, id, newDate, reason);
          result = {
            kind: 'updated',
            reservation: updated,
            message: `Reserva ${updated.code} movida al ${formatTravelDate(updated.travelDate)}.`,
          };
          break;
        }
        case 'payment': {
          const updated = await changePaymentStatus(send, reservation.payment.id, paymentStatus as PaymentStatus, reason);
          result = {
            kind: 'updated',
            reservation: updated,
            message:
              updated.status === 'Cancelada'
                ? `Pago de ${updated.code} rechazado: la reserva quedó cancelada y su cupo libre.`
                : `Pago de ${updated.code} cambiado a «${updated.payment.status}».`,
          };
          break;
        }
      }
      onDone(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setErrors({ reason: error.fieldError('reason'), travelDate: error.fieldError('travelDate'), status: error.fieldError('status') });
      }
      // 404/409: la reserva cambió entretanto (otra pestaña u otra acción); se sugiere recargar
      const stale = error instanceof ApiError && (error.status === 404 || error.status === 409);
      setProblem(stale ? `${errorMessage(error).replace(/\.$/, '')}. Usa «Actualizar listado» para ver el estado actual.` : errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  const info = action ? ACTIONS[action] : null;
  const reasonRequired = action === 'reschedule' || (action === 'payment' && paymentStatus === 'Rechazado');

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[calc(100%-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-musgo bg-papel p-0 text-basalto shadow-xl backdrop:bg-basalto/50"
    >
      {reservation && (
        <div className="space-y-5 p-6">
          <div>
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
              {info ? info.label : `Reserva ${reservation.code}`}
            </h2>
            <p className="text-basalto-suave">
              {info ? `${reservation.code}: ` : ''}
              {reservation.destination.name}, {formatTravelDate(reservation.travelDate)}
            </p>
          </div>

          {problem && <Alert tone="error">{problem}</Alert>}

          {/* Paso 1: la información de la reserva y las acciones posibles (CU-12 a CU-15, paso 3) */}
          {!action && (
            <>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail term="Cliente" value={`${reservation.customerName} (${reservation.customerEmail})`} />
                <Detail term="Personas" value={String(reservation.quote.people)} />
                <Detail term="Total" value={formatColones(reservation.quote.total)} />
                <Detail term="Reservada el" value={formatDateTime(reservation.createdAt)} />
                <Detail term="Cambios de fecha" value={String(reservation.reschedules)} />
                <div>
                  <dt className="text-basalto-suave">Estados</dt>
                  <dd className="mt-1 flex flex-wrap gap-2">
                    <StatusBadge status={reservation.status} label="Reserva:" />
                    <StatusBadge status={reservation.payment.status} label="Pago:" />
                  </dd>
                </div>
              </dl>
              <ul className="space-y-2">
                {ACTION_ORDER.map((key) => {
                  const blocked = ACTIONS[key].blockedBy(reservation);
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-3">
                      <Button
                        variant={key === 'cancel' || key === 'delete' ? 'secondary' : 'primary'}
                        disabled={blocked !== null}
                        aria-describedby={blocked ? `${titleId}-${key}` : undefined}
                        onClick={() => chooseAction(key)}
                        className="min-w-56"
                      >
                        {ACTIONS[key].label}
                      </Button>
                      {blocked && (
                        <span id={`${titleId}-${key}`} className="text-sm text-basalto-suave">
                          {blocked}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end">
                <Button variant="ghost" onClick={close}>
                  Cerrar
                </Button>
              </div>
            </>
          )}

          {/* Paso 2: datos de la acción y confirmación */}
          {action && (
            <form onSubmit={handleConfirm} noValidate className="space-y-4">
              {action === 'approve' && <p>La reserva pasará a «Aprobada».</p>}
              {action === 'cancel' && (
                <p>
                  La reserva pasará a «Cancelada» y su cupo quedará libre. Solo se permite si faltan más de 48 horas para el
                  viaje (RN-02).
                </p>
              )}
              {action === 'delete' && <p>La reserva dejará de aparecer en el listado. Su historial se conserva.</p>}
              {action === 'reschedule' && (
                <>
                  <p>
                    Por causa mayor, sin la restricción de 48 horas. Se revisa que haya cupo en la fecha nueva y el monto no
                    cambia. El turista podrá cancelar aunque falten 48 horas o menos.
                  </p>
                  <TextField
                    label="Nueva fecha del viaje"
                    name="travelDate"
                    type="date"
                    min={firstTravelDate()}
                    value={newDate}
                    onChange={(event) => setNewDate(event.target.value)}
                    error={errors.travelDate}
                    required
                  />
                </>
              )}
              {action === 'payment' && (
                <>
                  <SelectField
                    label="Nuevo estado del pago"
                    hint={`Estado actual: ${reservation.payment.status}`}
                    name="status"
                    value={paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus | '')}
                    error={errors.status}
                    required
                  >
                    <option value="">Elige un estado</option>
                    {/* Sin el estado actual, y sin "Pendiente" si la reserva ya está aprobada
                        (la API lo rechaza: una reserva aprobada exige el pago aprobado, V35) */}
                    {PAYMENT_STATES.filter(
                      (state) =>
                        state !== reservation.payment.status &&
                        !(state === 'Pendiente' && reservation.status === 'Aprobada'),
                    ).map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </SelectField>
                  {paymentStatus === 'Rechazado' && (
                    <Alert tone="warning">
                      Rechazar el pago cancela la reserva y libera su cupo, aunque falten 48 horas o menos. No se puede
                      deshacer.
                    </Alert>
                  )}
                </>
              )}
              <TextAreaField
                label="Motivo"
                optional={!reasonRequired}
                hint={reasonRequired ? 'Obligatorio: queda en el historial de la reserva.' : 'Queda en el historial de la reserva.'}
                name="reason"
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                error={errors.reason}
              />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => chooseAction(null)} disabled={working}>
                  Volver sin cambios
                </Button>
                <Button
                  type="submit"
                  variant={action === 'cancel' || action === 'delete' || paymentStatus === 'Rechazado' ? 'danger' : 'primary'}
                  loading={working}
                  loadingText="Guardando…"
                >
                  Confirmar: {info?.label.toLowerCase()}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-basalto-suave">{term}</dt>
      <dd className="font-semibold break-words">{value}</dd>
    </div>
  );
}