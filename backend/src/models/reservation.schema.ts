// Plantillas (zod) de las rutas públicas de reservas.
// - POST /reservas (RF-03, CU-03): decisión 3 = A, los 3 campos de la cotización (destino, fecha,
//   personas) con sus MISMAS reglas (ver quote.schema.ts) + nombre, correo y tarjeta.
// - POST /reservas/consulta (RF-04, CU-04): decisiones 9 = B y 14 = A, código + correo en el body.
// - PATCH /reservas/fecha (RF-05, CU-05): decisión 15 = C, código + correo + fecha nueva en el body.

import { z } from 'zod';
import { emailField } from './auth.schema';
import { travelDateField } from './destination.schema';
import { createQuoteSchema } from './quote.schema';

// Largo máximo del nombre del turista (V, decisión 4): el mismo que el nombre de un destino
const CUSTOMER_NAME_MAX_LENGTH = 100;
// Tarjeta simulada: solo dígitos, de 13 a 19 (decisión A del 03/11)
const CARD_NUMBER_PATTERN = /^\d{13,19}$/;

// NUEVO (6.D): forma del código de confirmación (decisión 5 = A). Se define AQUÍ una sola vez:
// generateConfirmationCode (reservation.service.ts) los usa para crear códigos y la consulta
// para validarlos, así el formato que se acepta es siempre el mismo que se genera.
export const CONFIRMATION_CODE_PREFIX = 'VY-';
export const CONFIRMATION_CODE_LENGTH = 8;
// 31 caracteres: dígitos 2-9 y letras A-Z SIN los que se confunden al leer o dictar
// (0 y O, 1, I y L). 31^8 ≈ 850 mil millones de combinaciones.
export const CONFIRMATION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
// "VY-" + 8 caracteres del alfabeto. Resultado: /^VY-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/
const CONFIRMATION_CODE_PATTERN = new RegExp(
  `^${CONFIRMATION_CODE_PREFIX}[${CONFIRMATION_CODE_ALPHABET}]{${CONFIRMATION_CODE_LENGTH}}$`,
);

// Body de POST /reservas. Ejemplo válido:
// { "destinationId": 4, "travelDate": "2026-12-20", "people": 2, "customerName": "Ana Mora",
//   "customerEmail": "ana@correo.com", "cardNumber": "4111111111111112" }
export const createReservationSchema = createQuoteSchema.extend({
  // Cualquier carácter (tildes, ñ, apóstrofes, guiones); sin espacios a los lados
  customerName: z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(1, { error: 'El nombre es obligatorio' })
    .max(CUSTOMER_NAME_MAX_LENGTH, {
      error: `El nombre no puede tener más de ${CUSTOMER_NAME_MAX_LENGTH} caracteres`,
    }),
  // La misma regla del correo del login (C17): sin espacios, minúsculas, formato, máx. 254
  customerEmail: emailField,
  // Texto (no número): un número JSON de 19 dígitos pierde precisión en JavaScript
  cardNumber: z
    .string({ error: 'El número de tarjeta es obligatorio y debe ser un texto' })
    .regex(CARD_NUMBER_PATTERN, { error: 'El número de tarjeta debe tener solo dígitos, de 13 a 19' }),
});

// Tipo que sale de la plantilla: los 6 campos ya limpios
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// NUEVO (6.D): código de confirmación tal como lo escribe el turista. Se le quitan los espacios
// y se pasa a mayúsculas (así se guardó), y DESPUÉS se revisa la forma.
// Ejemplo: " vy-f57nxnw9 " → "VY-F57NXNW9"; "VY-123" → error (sin consultar la base).
export const confirmationCodeField = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .regex(CONFIRMATION_CODE_PATTERN, { error: 'El código no tiene un formato válido' });

// NUEVO (6.D): body de POST /reservas/consulta (CU-04 pasos 3 y 4). Ejemplo válido:
// { "code": "vy-f57nxnw9", "customerEmail": "Ana@Correo.com" }
//   → { code: "VY-F57NXNW9", customerEmail: "ana@correo.com" }
export const lookupReservationSchema = z.object(
  {
    code: confirmationCodeField,
    // El mismo nombre de campo que la reserva, con la misma regla (C17)
    customerEmail: emailField,
  },
  { error: 'El cuerpo de la petición debe ser un objeto JSON' },
);

// Tipo que sale de la plantilla: { code: string; customerEmail: string }
export type LookupReservationInput = z.infer<typeof lookupReservationSchema>;

// NUEVO (6.E): body de PATCH /reservas/fecha (CU-05, decisión 15 = C). Es la plantilla de la
// consulta (código + correo) más la fecha NUEVA, con la misma regla de fecha de la cotización.
// Ejemplo válido: { "code": "VY-F57NXNW9", "customerEmail": "ana@correo.com", "travelDate": "2026-12-15" }
export const rescheduleReservationSchema = lookupReservationSchema.extend({
  travelDate: travelDateField,
});

// Tipo que sale de la plantilla: { code: string; customerEmail: string; travelDate: string }
export type RescheduleReservationInput = z.infer<typeof rescheduleReservationSchema>;