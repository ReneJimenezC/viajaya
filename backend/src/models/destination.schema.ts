// Plantillas (zod) de lo que reciben las rutas de destinos (RF-07, CU-07 y CU-09).

import { z } from 'zod';

// Largos máximos (V): suficientes para nombres y lugares reales
const NAME_MAX_LENGTH = 100;
const PLACE_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 1000;
// Mayor precio que cabe en NUMERIC(12,2): 10 dígitos enteros y 2 decimales
const PRICE_MAX = 9_999_999_999.99;
// Mayor capacidad que cabe en una columna integer de Postgres
const CAPACITY_MAX = 2_147_483_647;

// Dice si un número tiene como máximo 2 decimales. Ejemplo: 42500.5 → true; 12.345 → false.
// Se multiplica por 100 y se compara con su redondeo, con un margen mínimo para los
// errores normales de los decimales binarios (42500.1 × 100 = 4250010.000000001).
function hasAtMostTwoDecimals(value: number): boolean {
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(1, { error: 'El nombre es obligatorio' })
  .max(NAME_MAX_LENGTH, { error: `El nombre no puede tener más de ${NAME_MAX_LENGTH} caracteres` });

const placeField = z
  .string({ error: 'El lugar es obligatorio' })
  .trim()
  .min(1, { error: 'El lugar es obligatorio' })
  .max(PLACE_MAX_LENGTH, { error: `El lugar no puede tener más de ${PLACE_MAX_LENGTH} caracteres` });

// Descripción opcional; texto vacío o null = sin descripción
const descriptionField = z
  .string({ error: 'La descripción debe ser un texto' })
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `La descripción no puede tener más de ${DESCRIPTION_MAX_LENGTH} caracteres`,
  })
  .nullable()
  .transform((value) => (value ? value : null));

// Precio en colones como número JSON (42500 o 42500.5). Sale como texto con 2 decimales
// ("42500.50"), igual que lo guarda NUMERIC(12,2): así nunca se opera con decimales flotantes.
const basePriceField = z
  .number({ error: 'El precio base debe ser un número' })
  .positive({ error: 'El precio base debe ser mayor que 0' })
  .max(PRICE_MAX, { error: 'El precio base es demasiado grande' })
  .refine(hasAtMostTwoDecimals, { error: 'El precio base admite como máximo 2 decimales' })
  .transform((value) => value.toFixed(2));

const dailyCapacityField = z
  .number({ error: 'La capacidad diaria debe ser un número' })
  .int({ error: 'La capacidad diaria debe ser un número entero' })
  .min(1, { error: 'La capacidad diaria debe ser al menos 1' })
  .max(CAPACITY_MAX, { error: 'La capacidad diaria es demasiado grande' });

// Body de POST /admin/destinos (CU-07). Ejemplo válido:
// { "name": "Volcán Poás", "place": "Alajuela", "basePrice": 25000, "dailyCapacity": 30 }
export const createDestinationSchema = z.object(
  {
    name: nameField,
    place: placeField,
    description: descriptionField.optional().transform((value) => value ?? null),
    basePrice: basePriceField,
    dailyCapacity: dailyCapacityField,
  },
  { error: 'El cuerpo de la petición debe ser un objeto JSON' },
);

// Body de PATCH /admin/destinos/:id (CU-09): los mismos campos, todos opcionales,
// pero al menos uno. Ejemplo: { "basePrice": 27500 }
export const updateDestinationSchema = z
  .object(
    {
      name: nameField.optional(),
      place: placeField.optional(),
      description: descriptionField.optional(),
      basePrice: basePriceField.optional(),
      dailyCapacity: dailyCapacityField.optional(),
    },
    { error: 'El cuerpo de la petición debe ser un objeto JSON' },
  )
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Indica al menos un campo para modificar',
  });

export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;