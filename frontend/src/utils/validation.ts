// Validación de los formularios en el navegador, con zod (la misma librería del backend).
// Sirve para avisar al instante qué campo corregir (CU-01 4a, CU-03 4a, CU-04 4a...).
// La API vuelve a validar todo: la regla que manda siempre es la del backend.

import { z } from 'zod';
import { isCalendarDate, todayInCostaRica } from './format';

// ----- Campos reutilizables (los mismos límites que el backend) -----
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'Escribe tu correo electrónico' })
  .max(254, { error: 'El correo no puede tener más de 254 caracteres' })
  .pipe(z.email({ error: 'El correo no tiene un formato válido (ejemplo: nombre@correo.com)' }));

// Fecha de viaje: real y posterior a hoy en Costa Rica (CU-01 paso 4)
const travelDateField = z
  .string()
  .min(1, { error: 'Elige la fecha del viaje' })
  .refine(isCalendarDate, { error: 'La fecha no es válida' })
  .refine((date) => date > todayInCostaRica(), { error: 'La fecha del viaje debe ser posterior a hoy' });

// Personas: entero de 1 a 9999 (llega como texto desde el campo del formulario)
const peopleField = z
  .string()
  .trim()
  .min(1, { error: 'Indica cuántas personas viajan' })
  .regex(/^\d+$/, { error: 'Escribe un número entero de personas' })
  .transform(Number)
  .pipe(
    z
      .number()
      .min(1, { error: 'Debe viajar al menos 1 persona' })
      .max(9999, { error: 'El máximo es 9999 personas' }),
  );

// Código de confirmación: sin espacios y en mayúsculas, "VY-" + 8 caracteres sin 0/O/1/I/L
export const CONFIRMATION_CODE_PATTERN = /^VY-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
const codeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, { error: 'Escribe el código de tu reserva' })
  .regex(CONFIRMATION_CODE_PATTERN, { error: 'El código tiene la forma VY- seguido de 8 letras o números' });

// Motivo del admin: de 1 a 500 caracteres (V10 del backend)
export const reasonField = z
  .string()
  .trim()
  .min(1, { error: 'Escribe el motivo' })
  .max(500, { error: 'El motivo no puede tener más de 500 caracteres' });

// ----- Formularios del turista -----
// Búsqueda (CU-01): lugar opcional; fecha y personas para ver la disponibilidad
export const searchFormSchema = z.object({
  lugar: z.string().trim().max(150, { error: 'El lugar no puede tener más de 150 caracteres' }),
  fecha: travelDateField,
  personas: peopleField,
});

// Datos de la reserva (CU-03 paso 2). La tarjeta se limpia de espacios y guiones antes de
// revisarla (decisión del 03/11: "los quita el frontend"). Ejemplo: '4111 1111-1111 1112' → '4111111111111112'
export const reservationFormSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, { error: 'Escribe el nombre de quien reserva' })
    .max(100, { error: 'El nombre no puede tener más de 100 caracteres' }),
  customerEmail: emailField,
  cardNumber: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(
      z
        .string()
        .min(1, { error: 'Escribe el número de la tarjeta' })
        .regex(/^\d{13,19}$/, { error: 'El número de tarjeta debe tener de 13 a 19 dígitos' }),
    ),
});

// Consulta de reserva (CU-04 paso 2)
export const lookupFormSchema = z.object({
  code: codeField,
  customerEmail: emailField,
});

// Fecha nueva (CU-05 paso 7)
export const newDateFormSchema = z.object({ travelDate: travelDateField });

// ----- Formularios del admin -----
export const loginFormSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, { error: 'Escribe la contraseña' })
    .max(128, { error: 'La contraseña no puede tener más de 128 caracteres' }),
});

// Destino (CU-07 y CU-09). El precio admite coma o punto decimal: '25000,5' → 25000.5
export const destinationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Escribe el nombre del destino' })
    .max(100, { error: 'El nombre no puede tener más de 100 caracteres' }),
  place: z
    .string()
    .trim()
    .min(1, { error: 'Escribe el lugar del destino' })
    .max(150, { error: 'El lugar no puede tener más de 150 caracteres' }),
  description: z
    .string()
    .trim()
    .max(1000, { error: 'La descripción no puede tener más de 1000 caracteres' })
    .transform((value) => (value ? value : null)),
  basePrice: z
    .string()
    .trim()
    .min(1, { error: 'Escribe el precio por persona' })
    .transform((value) => value.replace(',', '.'))
    .pipe(
      z
        .string()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, { error: 'Escribe un precio en colones con hasta 2 decimales' })
        .transform(Number)
        .pipe(z.number().positive({ error: 'El precio debe ser mayor que 0' })),
    ),
  dailyCapacity: z
    .string()
    .trim()
    .min(1, { error: 'Escribe la capacidad diaria' })
    .regex(/^\d+$/, { error: 'La capacidad debe ser un número entero' })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, { error: 'La capacidad debe ser al menos 1' })
        .max(2_147_483_647, { error: 'La capacidad es demasiado grande' }),
    ),
});

// ----- Utilidad -----
// Errores por campo de un resultado de zod: { campo: 'mensaje' } (el primero de cada campo).
// Ejemplo: fecha vacía → { fecha: 'Elige la fecha del viaje' }
export type FieldErrors = Partial<Record<string, string>>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.');
    if (field && result[field] === undefined) {
      result[field] = issue.message;
    }
  }
  return result;
}