// Llamadas del administrador (RF-07 a RF-09). Todas necesitan el access token.
// No reciben el token directamente: reciben "send", la función de la sesión que agrega el
// token, lo renueva si venció y repite la petición una vez (ver context/AdminSessionContext).

import type { RequestOptions } from './api-client';
import type { AdminDestination, AdminReservation, DestinationInput, PaymentStatus } from './types';

// Forma de la función que entrega la sesión del admin. Ejemplo: send<T>('/admin/reservas')
export type AuthorizedRequest = <T>(path: string, options?: Omit<RequestOptions, 'token'>) => Promise<T>;

// ----- Destinos (RF-07, CU-07 a CU-10) -----
export function listDestinations(send: AuthorizedRequest): Promise<AdminDestination[]> {
  return send<AdminDestination[]>('/admin/destinos');
}

export function createDestination(send: AuthorizedRequest, input: DestinationInput): Promise<AdminDestination> {
  return send<AdminDestination>('/admin/destinos', { method: 'POST', body: input });
}

// Solo se envían los campos que cambiaron (CU-09)
export function updateDestination(
  send: AuthorizedRequest,
  id: number,
  changes: Partial<DestinationInput>,
): Promise<AdminDestination> {
  return send<AdminDestination>(`/admin/destinos/${id}`, { method: 'PATCH', body: changes });
}

export function deactivateDestination(send: AuthorizedRequest, id: number): Promise<AdminDestination> {
  return send<AdminDestination>(`/admin/destinos/${id}/desactivar`, { method: 'POST' });
}

// ----- Reservas (RF-08, CU-11 a CU-14) -----
// El motivo es opcional en aprobar, cancelar y eliminar (V26): si está vacío no se envía
function reasonBody(reason: string): { reason?: string } {
  const trimmed = reason.trim();
  return trimmed ? { reason: trimmed } : {};
}

export function listReservations(send: AuthorizedRequest): Promise<AdminReservation[]> {
  return send<AdminReservation[]>('/admin/reservas');
}

export function approveReservation(send: AuthorizedRequest, id: number, reason: string): Promise<AdminReservation> {
  return send<AdminReservation>(`/admin/reservas/${id}/aprobar`, { method: 'POST', body: reasonBody(reason) });
}

export function cancelReservationAsAdmin(
  send: AuthorizedRequest,
  id: number,
  reason: string,
): Promise<AdminReservation> {
  return send<AdminReservation>(`/admin/reservas/${id}/cancelar`, { method: 'POST', body: reasonBody(reason) });
}

// 204 sin contenido (borrado lógico, CU-14)
export function deleteReservation(send: AuthorizedRequest, id: number, reason: string): Promise<void> {
  return send<void>(`/admin/reservas/${id}`, { method: 'DELETE', body: reasonBody(reason) });
}

// Reagenda del admin sin RN-02 (N-2a): fecha y motivo obligatorios
export function rescheduleAsAdmin(
  send: AuthorizedRequest,
  id: number,
  travelDate: string,
  reason: string,
): Promise<AdminReservation> {
  return send<AdminReservation>(`/admin/reservas/${id}/fecha`, {
    method: 'PATCH',
    body: { travelDate, reason: reason.trim() },
  });
}

// ----- Pagos (RF-09, CU-15 + N-1) -----
// Con "Rechazado" el motivo es obligatorio y la reserva queda cancelada
export function changePaymentStatus(
  send: AuthorizedRequest,
  paymentId: number,
  status: PaymentStatus,
  reason: string,
): Promise<AdminReservation> {
  return send<AdminReservation>(`/admin/pagos/${paymentId}`, {
    method: 'PATCH',
    body: { status, ...reasonBody(reason) },
  });
}