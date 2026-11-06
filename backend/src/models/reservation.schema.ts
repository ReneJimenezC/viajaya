// Plantilla (zod) del body de POST /reservas (RF-03, CU-03).
// Decisión 3 = A: los 3 campos de la cotización (destino, fecha, personas) con sus MISMAS
// reglas (ver quote.schema.ts) + los 3 datos del formulario de CU-03 (nombre, correo, tarjeta).

import { z } from 'zod';
import { emailField } from './auth.schema';
import { createQuoteSchema } from './quote.schema';

// Largo máximo del nombre del turista (V, decisión 4): el mismo que el nombre de un destino
const CUSTOMER_NAME_MAX_LENGTH = 100;
// Tarjeta simulada: solo dígitos, de 13 a 19 (decisión A del 03/11)
const CARD_NUMBER_PATTERN = /^\d{13,19}$/;

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