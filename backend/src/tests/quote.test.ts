// Pruebas unitarias de la cotización (RF-02, CU-02): la plantilla del body y QuoteService.
// No usan base de datos: el repositorio de destinos se reemplaza por uno falso en memoria.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../errors/app-error';
import type { Destination } from '../models/destination.entity';
import { createQuoteSchema } from '../models/quote.schema';
import { QuoteService, type QuoteDestinationReader } from '../services/quote.service';

// 21:00 del 03/11/2026 en Costa Rica: "mañana" es el 04/11
const NOW = new Date('2026-11-04T03:00:00Z');
const TRAVEL_DATE = '2026-11-20';

// Destinos de prueba: Tortuguero (capacidad 20, activo) y Volcán Poás (desactivado)
const TORTUGUERO = {
  id: 4, name: 'Tortuguero', description: null, place: 'Tortuguero, Limón',
  basePrice: '47500.00', dailyCapacity: 20, active: true,
} as Destination;
const POAS = { ...TORTUGUERO, id: 11, name: 'Volcán Poás', active: false } as Destination;

// Repositorio falso: conoce los dos destinos y tiene 18 personas reservadas en Tortuguero
function fakeReader(reservedInTortuguero = 18): QuoteDestinationReader {
  const byId = new Map([[TORTUGUERO.id, TORTUGUERO], [POAS.id, POAS]]);
  return {
    findById: async (id: number) => byId.get(id) ?? null,
    reservedPeopleOn: async (_date: string, ids: number[]) =>
      new Map(ids.includes(TORTUGUERO.id) ? [[TORTUGUERO.id, reservedInTortuguero]] : []),
  } as QuoteDestinationReader;
}

// Comprueba que la promesa falle con un AppError del código HTTP indicado y devuelve el error
async function rejectsWith(promise: Promise<unknown>, status: number): Promise<AppError> {
  let caught: unknown;
  await assert.rejects(promise, (error: unknown) => {
    caught = error;
    return error instanceof AppError && error.status === status;
  });
  return caught as AppError;
}

describe('createQuoteSchema (body de POST /cotizaciones)', () => {
  test('datos válidos → pasan tal cual y se descartan campos extra', () => {
    assert.deepEqual(
      createQuoteSchema.parse({ destinationId: 4, travelDate: TRAVEL_DATE, people: 2, total: 1 }),
      { destinationId: 4, travelDate: TRAVEL_DATE, people: 2 },
    );
  });

  test('body vacío → error en los tres campos', () => {
    const result = createQuoteSchema.safeParse({});
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')).sort(), [
      'destinationId', 'people', 'travelDate',
    ]);
  });

  test('personas 0, decimales, texto o más de 9999 → error', () => {
    for (const people of [0, 2.5, '2', 10000]) {
      assert.equal(createQuoteSchema.safeParse({ destinationId: 4, travelDate: TRAVEL_DATE, people }).success, false, String(people));
    }
  });

  test('destino 0, negativo, decimal o texto → error', () => {
    for (const destinationId of [0, -1, 1.5, '4']) {
      assert.equal(createQuoteSchema.safeParse({ destinationId, travelDate: TRAVEL_DATE, people: 1 }).success, false, String(destinationId));
    }
  });

  test('fecha con otro formato o inexistente → error', () => {
    for (const travelDate of ['20/11/2026', '2026-02-30', '2026-13-01']) {
      assert.equal(createQuoteSchema.safeParse({ destinationId: 4, travelDate, people: 1 }).success, false, travelDate);
    }
  });
});

describe('QuoteService.create (CU-02)', () => {
  test('cabe justo (18 + 2 = 20) → datos del viaje y desglose de RN-03', async () => {
    const result = await new QuoteService(fakeReader()).create({ destinationId: 4, travelDate: TRAVEL_DATE, people: 2 }, NOW);
    assert.deepEqual(result, {
      destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
      travelDate: TRAVEL_DATE,
      quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva: '12350.00', total: '107350.00' },
    });
  });

  test('sin cupo (18 + 3 > 20) → 409 con los cupos disponibles', async () => {
    const error = await rejectsWith(
      new QuoteService(fakeReader()).create({ destinationId: 4, travelDate: TRAVEL_DATE, people: 3 }, NOW), 409,
    );
    assert.match(error.message, /Cupos disponibles: 2$/);
  });

  test('sin reservas ese día → se cotiza contra la capacidad completa', async () => {
    const result = await new QuoteService(fakeReader(0)).create({ destinationId: 4, travelDate: TRAVEL_DATE, people: 20 }, NOW);
    assert.equal(result.quote.total, '1073500.00');
  });

  test('destino desactivado (CU-02 1a) → 404', async () => {
    await rejectsWith(new QuoteService(fakeReader()).create({ destinationId: 11, travelDate: TRAVEL_DATE, people: 1 }, NOW), 404);
  });

  test('destino inexistente → 404 con el mismo mensaje', async () => {
    const service = new QuoteService(fakeReader());
    const missing = await rejectsWith(service.create({ destinationId: 999, travelDate: TRAVEL_DATE, people: 1 }, NOW), 404);
    const inactive = await rejectsWith(service.create({ destinationId: 11, travelDate: TRAVEL_DATE, people: 1 }, NOW), 404);
    assert.equal(missing.message, inactive.message);
  });

  test('fecha de hoy en Costa Rica → 400 (debe ser futura)', async () => {
    const error = await rejectsWith(
      new QuoteService(fakeReader()).create({ destinationId: 4, travelDate: '2026-11-03', people: 1 }, NOW), 400,
    );
    assert.equal(error.details?.[0]?.field, 'travelDate');
  });
});