// Plantilla (zod) del body de POST /cotizaciones (RF-02, CU-02).

import { z } from 'zod';
import { travelDateField } from './destination.schema';

// Mayor id que cabe en una columna integer de Postgres
const ID_MAX = 2_147_483_647;
// Mismo tope de personas que la búsqueda pública (RF-01)
const PEOPLE_MAX = 9999;

// Body de POST /cotizaciones. Ejemplo válido:
// { "destinationId": 1, "travelDate": "2026-11-20", "people": 2 }
export const createQuoteSchema = z.object(
  {
    destinationId: z
      .number({ error: 'El destino es obligatorio y debe ser un número' })
      .int({ error: 'El destino no es válido' })
      .min(1, { error: 'El destino no es válido' })
      .max(ID_MAX, { error: 'El destino no es válido' }),
    travelDate: travelDateField,
    people: z
      .number({ error: 'La cantidad de personas es obligatoria y debe ser un número' })
      .int({ error: 'La cantidad de personas debe ser un número entero' })
      .min(1, { error: 'La cantidad de personas debe ser al menos 1' })
      .max(PEOPLE_MAX, { error: `La cantidad de personas no puede ser mayor que ${PEOPLE_MAX}` }),
  },
  { error: 'El cuerpo de la petición debe ser un objeto JSON' },
);

// Tipo que sale de la plantilla: { destinationId: number; travelDate: string; people: number }
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;