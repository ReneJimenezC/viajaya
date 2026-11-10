// Convierte el :id de una URL en número (decisión B del 08/11, C17). La usan los controladores
// del admin (destinos y reservas); antes estaba copiada dentro de admin-destination.controller.ts.

import { AppError } from '../errors/app-error';

// Id de la URL: entero positivo que cabe en una columna integer de Postgres
const ID_PATTERN = /^[1-9]\d{0,9}$/;
const ID_MAX = 2_147_483_647;

// Si el valor no es un id posible ("abc", "0", "1.5", "99999999999"), responde 404 con el
// mensaje que se le pase, igual que un id inexistente (sección 7: así no se dan pistas).
// Ejemplos: ("12", "El destino no existe") → 12; ("abc", "La reserva no existe") → 404
export function parseId(value: string | string[] | undefined, notFoundMessage: string): number {
  const id = typeof value === 'string' && ID_PATTERN.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(id) || id > ID_MAX) {
    throw new AppError(404, 'NOT_FOUND', notFoundMessage);
  }
  return id;
}