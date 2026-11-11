// Llamadas públicas del turista (RF-01 a RF-06). No llevan token: el turista entra con
// código + correo (ADR-06). Cada función es una ruta del backend (ver docs/api/openapi.yaml).

import { request } from './api-client';
import type {
  CreateReservationInput,
  PublicDestination,
  QuoteResult,
  Reservation,
  ReservationAccess,
} from './types';

// Filtros de la búsqueda (CU-01). fecha y personas van juntas o no van.
export interface DestinationSearch {
  lugar?: string;
  fecha?: string;
  personas?: number;
}

// GET /destinos?lugar&fecha&personas (RF-01). URLSearchParams arma la consulta y escapa
// los caracteres especiales. Ejemplo: { lugar: 'Limón' } → "/destinos?lugar=Lim%C3%B3n"
export function searchDestinations(search: DestinationSearch, signal?: AbortSignal): Promise<PublicDestination[]> {
  const params = new URLSearchParams();
  if (search.lugar) params.set('lugar', search.lugar);
  if (search.fecha) params.set('fecha', search.fecha);
  if (search.personas !== undefined) params.set('personas', String(search.personas));
  const query = params.toString();
  return request<PublicDestination[]>(query ? `/destinos?${query}` : '/destinos', { signal });
}

// POST /cotizaciones (RF-02). No guarda nada; responde el desglose de RN-03.
export function getQuote(
  input: { destinationId: number; travelDate: string; people: number },
  signal?: AbortSignal,
): Promise<QuoteResult> {
  return request<QuoteResult>('/cotizaciones', { method: 'POST', body: input, signal });
}

// POST /reservas (RF-03). 201 con la reserva y su código; 402 si la tarjeta es rechazada.
export function createReservation(input: CreateReservationInput): Promise<Reservation> {
  return request<Reservation>('/reservas', { method: 'POST', body: input });
}

// POST /reservas/consulta (RF-04). Código y correo en el body, nunca en la URL (N-4).
export function lookupReservation(access: ReservationAccess): Promise<Reservation> {
  return request<Reservation>('/reservas/consulta', { method: 'POST', body: access });
}

// PATCH /reservas/fecha (RF-05)
export function rescheduleReservation(access: ReservationAccess, travelDate: string): Promise<Reservation> {
  return request<Reservation>('/reservas/fecha', { method: 'PATCH', body: { ...access, travelDate } });
}

// POST /reservas/cancelar (RF-06)
export function cancelReservation(access: ReservationAccess): Promise<Reservation> {
  return request<Reservation>('/reservas/cancelar', { method: 'POST', body: access });
}