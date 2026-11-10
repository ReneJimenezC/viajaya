// ReservaService, parte del administrador (SAD 3.1: CAR-08; decisión 2 = B del Paso 8).
// Gestión de reservas desde el módulo admin (RF-08, CU-11 a CU-14). Va separado del servicio
// del turista para no mezclar sus reglas y para que las partes N (reagenda del admin, rechazo
// del pago) queden aisladas (C6). Comparte con él las reglas puras y la forma de la respuesta.

import { AppError } from '../errors/app-error';
import type { AdminActionType } from '../models/admin-action.entity';
import type {
  AdminActionInput,
  AdminRescheduleInput,
  ChangePaymentStatusInput,
} from '../models/admin-reservation.schema';
import type { PaymentStatus } from '../models/payment.entity';
import type { AdminActionRepository } from '../repositories/admin-action.repository';
import type { DestinationRepository } from '../repositories/destination.repository';
import type {
  AdminReservationDetails,
  AdminReservationRef,
  ReservationRepository,
} from '../repositories/reservation.repository';
import { canChangeReservation, capacityConflict, hasCapacity, isFutureTravelDate } from './business-rules';
import {
  buildReservationResult,
  CANCEL_WINDOW_MESSAGE,
  RESCHEDULE_UNAVAILABLE_MESSAGE,
  type ReservationResult,
} from './reservation.service';




// NUEVO (8.C-8.E): mensajes de las acciones del admin
// V20: id inválido, inexistente o de una reserva eliminada (CU-12/13/14 2a)
const NOT_FOUND_MESSAGE = 'La reserva no existe';
// V21: aprobar algo que no está pendiente (CU-12 2a: "ya fue procesada")
const ALREADY_PROCESSED_MESSAGE = 'La reserva ya fue procesada';
// V22: aprobar una reserva cuyo pago no está aprobado
const PAYMENT_NOT_APPROVED_MESSAGE = 'El pago de la reserva no está aprobado';
// V23: cancelar una que ya está cancelada (CU-13 2a)
const ALREADY_CANCELLED_MESSAGE = 'La reserva ya está cancelada';
// V24: eliminar una que no está cancelada
const DELETE_ONLY_CANCELLED_MESSAGE = 'Solo se pueden eliminar reservas canceladas';
// NUEVO (8.F): mensajes del cambio de pago (CU-15)
// CU-15 2a: el pago no existe (o su reserva fue eliminada)
const PAYMENT_NOT_FOUND_MESSAGE = 'El pago no existe';
// V32: solo el intento de pago más reciente de la reserva
const PAYMENT_NOT_LATEST_MESSAGE = 'Solo se puede cambiar el pago más reciente de la reserva';
// V33 (N-1, "no se deshace"): reserva cancelada, por el turista, el admin o un rechazo
const PAYMENT_RESERVATION_CANCELLED_MESSAGE = 'No se puede cambiar el pago de una reserva cancelada';
// V34
const PAYMENT_SAME_STATUS_MESSAGE = 'El pago ya tiene ese estado';
// V35 (coherente con V22): una reserva aprobada no puede quedar sin pago confirmado
const PAYMENT_PENDING_APPROVED_MESSAGE = 'No se puede dejar pendiente el pago de una reserva aprobada';
// NUEVO (8.G): V40, mover una cancelada la "reviviría"
const RESCHEDULE_CANCELLED_MESSAGE = 'No se puede cambiar la fecha de una reserva cancelada';

// NUEVO (8.F): acción del historial para cada estado nuevo del pago (V13)
// Record<A, B> = un mapa fijo con una entrada por cada estado (como un EnumMap de Java)
const PAYMENT_ACTIONS: Record<PaymentStatus, AdminActionType> = {
  Pendiente: 'pago_pendiente',
  Aprobado: 'pago_aprobado',
  Rechazado: 'pago_rechazado',
};

// Lo que el servicio necesita de los repositorios dentro de la transacción. Solo esos métodos:
// así las pruebas pueden pasar repositorios falsos (mismo patrón que ReservationStores).
// CAMBIO (8.C-8.E): se agregan los métodos de aprobar, cancelar y eliminar, y el historial.
export interface AdminReservationStores {
  reservations: Pick<
    ReservationRepository,
    | 'findAllForAdmin'
    | 'findByIdForUpdate'
    | 'findDetailsById'
    | 'approveReservation'
    | 'cancelReservation'
    | 'markDeleted'
    // NUEVO (8.F)
    | 'findPaymentForUpdate'
    | 'updatePaymentStatus'
        // NUEVO (8.G)
    | 'updateTravelDate'
  >;
  adminActions: Pick<AdminActionRepository, 'record'>;
    // NUEVO (8.G): el destino, para bloquearlo y validar RN-01 al reagendar (SAD 3.2)
  destinations: Pick<DestinationRepository, 'findByIdForUpdate' | 'reservedPeopleOn'>;
}

// Igual que RunInTransaction del turista, pero entrega las piezas del admin.
// En la app real es AppDataSource.transaction (ver app.ts); en las pruebas, una función falsa.
export type AdminRunInTransaction = <T>(work: (stores: AdminReservationStores) => Promise<T>) => Promise<T>;

// Una reserva tal como la ve el admin (V17): la misma forma que el turista + id y reschedules
export interface AdminReservationResult extends ReservationResult {
  id: number;
  // CAMBIO (8.F, V29): el pago del admin incluye su id
  payment: ReservationResult['payment'] & { id: number };
  reschedules: number;
}

// Arma la respuesta del admin a partir de la del turista (V19: no se copia la lógica).
// CAMBIO (8.F, V29): el bloque "payment" del admin lleva además el id del pago, primero.
// Ejemplo: { id: 1, code: 'VY-F57NXNW9', ..., paymentId: 7, reschedules: 2 }
//   → { id: 1, code, ..., payment: { id: 7, status, cardLastDigit }, createdAt, reschedules: 2 }
function buildAdminReservationResult(details: AdminReservationDetails): AdminReservationResult {
  const result = buildReservationResult(details);
  return {
    id: details.id,
    ...result,
    // Se reemplaza "payment" en su mismo lugar, ahora con el id adelante
    payment: { id: details.paymentId, ...result.payment },
    reschedules: details.reschedules,
  };
}

// NUEVO (8.C-8.E): busca la reserva y la BLOQUEA (V27); si no existe o está eliminada → 404 (V20).
// Ejemplo: (stores, 1) → { id: 1, status: 'Pendiente', travelDate: '2026-12-10', paymentStatus: 'Aprobado' }
async function lockReservation(stores: AdminReservationStores, id: number): Promise<AdminReservationRef> {
  const reservation = await stores.reservations.findByIdForUpdate(id);
  if (!reservation) {
    throw new AppError(404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
  }
  return reservation;
}

// NUEVO (8.C-8.E): anota en el historial una acción "simple" (sin fechas, V12) en la MISMA
// transacción (V14). El motivo es opcional en estas acciones (V10, V26): sin motivo → null.
// Ejemplo: (stores, 1, 3, 'aprobar', {}) → fila { reserva 1, admin 3, 'aprobar', motivo null }
async function recordAction(
  stores: AdminReservationStores,
  reservationId: number,
  adminId: number,
  action: AdminActionType,
  input: AdminActionInput,
): Promise<void> {
  await stores.adminActions.record({
    reservationId,
    adminId,
    action,
    reason: input.reason ?? null,
    previousDate: null,
    newDate: null,
  });
}

// NUEVO (8.C-8.D): lee la reserva ya cambiada (dentro de la transacción) y arma la respuesta.
// Si no la encuentra es un error interno: se acaba de bloquear y nadie más puede borrarla.
async function readResult(stores: AdminReservationStores, id: number): Promise<AdminReservationResult> {
  const details = await stores.reservations.findDetailsById(id);
  if (!details) {
    throw new Error(`La reserva ${id} desapareció dentro de la transacción`);
  }
  return buildAdminReservationResult(details);
}

export class AdminReservationService {
  constructor(private readonly runInTransaction: AdminRunInTransaction) {}

  // CU-11: listado de reservas (V15 a V18). Solo lee: no bloquea ni guarda nada.
  // Va por runInTransaction (como lookup del turista) para usar las mismas piezas falsas.
  // Ejemplo: () → [{ id: 1, code: 'VY-F57NXNW9', status: 'Pendiente', ... }] o [] si no hay
  list(): Promise<AdminReservationResult[]> {
    return this.runInTransaction(async ({ reservations }) => {
      const rows = await reservations.findAllForAdmin();
      return rows.map(buildAdminReservationResult);
    });
  }

  // NUEVO (8.C) CU-12: aprobar. Solo desde 'Pendiente' (V21) y con el pago 'Aprobado' (V22).
  // Ejemplo: (1, 3, {}) → la reserva 1 con status 'Aprobada'; historial 'aprobar'
  approve(id: number, adminId: number, input: AdminActionInput): Promise<AdminReservationResult> {
    return this.runInTransaction(async (stores) => {
      const reservation = await lockReservation(stores, id);
      if (reservation.status !== 'Pendiente') {
        throw new AppError(409, 'CONFLICT', ALREADY_PROCESSED_MESSAGE);
      }
      if (reservation.paymentStatus !== 'Aprobado') {
        throw new AppError(409, 'CONFLICT', PAYMENT_NOT_APPROVED_MESSAGE);
      }
      await stores.reservations.approveReservation(id);
      await recordAction(stores, id, adminId, 'aprobar', input);
      return readResult(stores, id);
    });
  }

  // NUEVO (8.D) CU-13: cancelar desde el admin. Desde 'Pendiente' o 'Aprobada'; ya cancelada →
  // 409 (V23). Respeta RN-02 (8.2b = no): 48 h o menos → 422, el mismo mensaje del turista.
  // El pago no se toca y no se bloquea el destino (como V7 y V8): el cupo se libera solo.
  // Ejemplo: (1, 3, { reason: 'Pedido del cliente' }, ahora) → status 'Cancelada'; historial 'cancelar'
  cancel(id: number, adminId: number, input: AdminActionInput, now: Date = new Date()): Promise<AdminReservationResult> {
    return this.runInTransaction(async (stores) => {
      const reservation = await lockReservation(stores, id);
      if (reservation.status === 'Cancelada') {
        throw new AppError(409, 'CONFLICT', ALREADY_CANCELLED_MESSAGE);
      }
      if (!canChangeReservation(reservation.travelDate, now)) {
        throw new AppError(422, 'BUSINESS_RULE', CANCEL_WINDOW_MESSAGE);
      }
      await stores.reservations.cancelReservation(id);
      await recordAction(stores, id, adminId, 'cancelar', input);
      return readResult(stores, id);
    });
  }

  // NUEVO (8.E) CU-14: eliminar. Solo reservas 'Cancelada' (V24); borrado lógico. No devuelve
  // nada: el controlador responde 204 (V25). Se llama "remove" porque "delete" confunde con SQL.
  // Ejemplo: (1, 3, {}) → la reserva 1 queda con eliminado_en; historial 'eliminar'
  remove(id: number, adminId: number, input: AdminActionInput): Promise<void> {
    return this.runInTransaction(async (stores) => {
      const reservation = await lockReservation(stores, id);
      if (reservation.status !== 'Cancelada') {
        throw new AppError(409, 'CONFLICT', DELETE_ONLY_CANCELLED_MESSAGE);
      }
      await stores.reservations.markDeleted(id);
      await recordAction(stores, id, adminId, 'eliminar', input);
    });
  }

  // NUEVO (8.F) CU-15 + N-1: cambiar el estado del pago (V29 a V38).
  // - Rechazado: el pago queda 'Rechazado' y la reserva 'Cancelada' (libera el cupo), con motivo
  //   obligatorio (lo exige la plantilla) y AUNQUE falten 48 h o menos (8.1 = A, V36).
  // - Pendiente o Aprobado: solo cambia el pago.
  // Ejemplo: (7, 3, { status: 'Rechazado', reason: 'No llegó el pago' }) → reserva 'Cancelada',
  //   pago 'Rechazado'; historial 'pago_rechazado' con el motivo
  changePaymentStatus(paymentId: number, adminId: number, input: ChangePaymentStatusInput): Promise<AdminReservationResult> {
    return this.runInTransaction(async (stores) => {
      const payment = await stores.reservations.findPaymentForUpdate(paymentId);
      if (!payment) {
        throw new AppError(404, 'NOT_FOUND', PAYMENT_NOT_FOUND_MESSAGE);
      }
      if (!payment.isLatest) {
        throw new AppError(409, 'CONFLICT', PAYMENT_NOT_LATEST_MESSAGE);
      }
      if (payment.reservationStatus === 'Cancelada') {
        throw new AppError(409, 'CONFLICT', PAYMENT_RESERVATION_CANCELLED_MESSAGE);
      }
      if (payment.paymentStatus === input.status) {
        throw new AppError(409, 'CONFLICT', PAYMENT_SAME_STATUS_MESSAGE);
      }
      if (input.status === 'Pendiente' && payment.reservationStatus === 'Aprobada') {
        throw new AppError(409, 'CONFLICT', PAYMENT_PENDING_APPROVED_MESSAGE);
      }

      await stores.reservations.updatePaymentStatus(paymentId, input.status);
      if (input.status === 'Rechazado') {
        // N-1: el dinero no llegó → la reserva se cancela y el cupo queda libre (sin RN-02)
        await stores.reservations.cancelReservation(payment.reservationId);
      }
      await recordAction(stores, payment.reservationId, adminId, PAYMENT_ACTIONS[input.status], input);
      return readResult(stores, payment.reservationId);
    });
  }
  
  // NUEVO (8.G) N-2a: el admin cambia la fecha SIN RN-02 (causa mayor), con motivo obligatorio
  // (V39). Sigue validando la fecha futura y RN-01 dentro de una transacción con el destino
  // bloqueado (SAD 3.2), como el cambio del turista. Monto igual; reschedules + 1 (V43); la
  // reserva conserva su estado (V40). El historial guarda fecha anterior, nueva y motivo (V12).
  // Ejemplo: (1, 3, { travelDate: '2026-12-12', reason: 'Derrumbe en la ruta' }, ahora)
  //   → la reserva 1 pasa del 10/12 al 12/12; historial 'reagendar' 10/12 → 12/12
  // async: así el 400 de la fecha también llega como promesa rechazada (igual que el del turista)
  async reschedule(
    id: number,
    adminId: number,
    input: AdminRescheduleInput,
    now: Date = new Date(),
  ): Promise<AdminReservationResult> {
    const { travelDate: newDate, reason } = input;

    // Fecha nueva posterior a hoy en Costa Rica, sin abrir la transacción (como el turista)
    if (!isFutureTravelDate(newDate, now)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
        { field: 'travelDate', message: 'La fecha del viaje debe ser posterior a hoy' },
      ]);
    }

    return this.runInTransaction(async (stores) => {
      // Orden de candados: reserva → destino, el mismo del cambio del turista (sin ciclos)
      const reservation = await lockReservation(stores, id);
      if (reservation.status === 'Cancelada') {
        throw new AppError(409, 'CONFLICT', RESCHEDULE_CANCELLED_MESSAGE);
      }
      // V41: la misma fecha no es un cambio
      if (newDate === reservation.travelDate) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
          { field: 'travelDate', message: 'La nueva fecha debe ser distinta de la actual' },
        ]);
      }
      // N-2a: aquí NO se revisa RN-02 (es la excepción aprobada por el profesor)

      // SAD 3.2: bloquea el destino (el mismo candado de las reservas nuevas); V42: desactivado → 409
      const destination = await stores.destinations.findByIdForUpdate(reservation.destinationId);
      if (!destination || !destination.active) {
        throw new AppError(409, 'CONFLICT', RESCHEDULE_UNAVAILABLE_MESSAGE);
      }

      // RN-01 en la fecha NUEVA (la reserva aún está en la vieja: no se cuenta dos veces)
      const reserved = await stores.destinations.reservedPeopleOn(newDate, [destination.id]);
      const reservedPeople = reserved.get(destination.id) ?? 0;
      if (!hasCapacity({ dailyCapacity: destination.dailyCapacity, reservedPeople, requestedPeople: reservation.people })) {
        throw capacityConflict(Math.max(destination.dailyCapacity - reservedPeople, 0));
      }

      // V43: la misma actualización del turista (fecha + reagendas + 1; el monto no cambia)
      await stores.reservations.updateTravelDate(id, newDate);
      // V12: el historial guarda de qué fecha a qué fecha y por qué
      await stores.adminActions.record({
        reservationId: id,
        adminId,
        action: 'reagendar',
        reason,
        previousDate: reservation.travelDate,
        newDate,
      });
      return readResult(stores, id);
    });
  }
}