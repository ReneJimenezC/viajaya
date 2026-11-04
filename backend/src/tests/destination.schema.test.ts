// Pruebas unitarias de la validación de destinos (CU-07 y CU-09) y de la fecha de hoy en
// Costa Rica, que usa la regla de capacidad. No usan base de datos.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDestinationSchema,
  searchDestinationsSchema,
  updateDestinationSchema,
} from '../models/destination.schema';
import { isFutureTravelDate, todayInCostaRica } from '../services/reservation.service';

const VALID = { name: 'Volcán Poás', place: 'Alajuela', basePrice: 25000, dailyCapacity: 30 };

// Devuelve los campos con error de un body inválido. Ejemplo: ['name', 'basePrice']
function failedFields(schema: typeof createDestinationSchema | typeof updateDestinationSchema, body: unknown): string[] {
  const result = schema.safeParse(body);
  assert.equal(result.success, false);
  return result.error!.issues.map((issue) => issue.path.join('.'));
}

describe('createDestinationSchema (CU-07)', () => {
  test('datos válidos → precio como texto con 2 decimales, sin descripción = null', () => {
    assert.deepEqual(createDestinationSchema.parse(VALID), {
      name: 'Volcán Poás',
      place: 'Alajuela',
      description: null,
      basePrice: '25000.00',
      dailyCapacity: 30,
    });
  });

  test('quita espacios a los lados y descarta campos extra', () => {
    const parsed = createDestinationSchema.parse({ ...VALID, name: '  Volcán Poás ', active: false });
    assert.equal(parsed.name, 'Volcán Poás');
    assert.equal('active' in parsed, false);
  });

  test('precio con 1 decimal → "25000.50"', () => {
    assert.equal(createDestinationSchema.parse({ ...VALID, basePrice: 25000.5 }).basePrice, '25000.50');
  });

  test('campos vacíos o faltantes → error en cada uno (CU-07 5a)', () => {
    assert.deepEqual(failedFields(createDestinationSchema, { name: '   ' }).sort(), [
      'basePrice', 'dailyCapacity', 'name', 'place',
    ]);
  });

  test('precio 0, negativo, con 3 decimales o como texto → error', () => {
    for (const basePrice of [0, -10, 12.345, '25000']) {
      assert.deepEqual(failedFields(createDestinationSchema, { ...VALID, basePrice }), ['basePrice']);
    }
  });

  test('capacidad 0, decimal o negativa → error', () => {
    for (const dailyCapacity of [0, 2.5, -1]) {
      assert.deepEqual(failedFields(createDestinationSchema, { ...VALID, dailyCapacity }), ['dailyCapacity']);
    }
  });
});

describe('updateDestinationSchema (CU-09)', () => {
  test('un solo campo → solo ese campo', () => {
    assert.deepEqual(updateDestinationSchema.parse({ basePrice: 27500 }), { basePrice: '27500.00' });
  });

  test('descripción vacía o null → null (se borra)', () => {
    assert.deepEqual(updateDestinationSchema.parse({ description: '  ' }), { description: null });
    assert.deepEqual(updateDestinationSchema.parse({ description: null }), { description: null });
  });

  test('body vacío → error "al menos un campo"', () => {
    assert.equal(updateDestinationSchema.safeParse({}).success, false);
  });
});

describe('todayInCostaRica', () => {
  test('21:00 del 03/11 en Costa Rica (03:00 UTC del 04/11) → "2026-11-03"', () => {
    assert.equal(todayInCostaRica(new Date('2026-11-04T03:00:00Z')), '2026-11-03');
  });

  test('00:00 del 04/11 en Costa Rica (06:00 UTC) → "2026-11-04"', () => {
    assert.equal(todayInCostaRica(new Date('2026-11-04T06:00:00Z')), '2026-11-04');
  });
});

describe('searchDestinationsSchema (RF-01, CU-01)', () => {
  test('sin parámetros → todo vacío (lista de destinos activos)', () => {
    assert.deepEqual(searchDestinationsSchema.parse({}), { place: undefined, date: undefined, people: undefined });
  });

  test('lugar, fecha y personas → nombres internos y personas como número', () => {
    assert.deepEqual(searchDestinationsSchema.parse({ lugar: ' Puntarenas ', fecha: '2026-12-10', personas: '4' }), {
      place: 'Puntarenas',
      date: '2026-12-10',
      people: 4,
    });
  });

  test('fecha sin personas (o al revés) → error (CU-01 4a)', () => {
    assert.equal(searchDestinationsSchema.safeParse({ fecha: '2026-12-10' }).success, false);
    assert.equal(searchDestinationsSchema.safeParse({ personas: '2' }).success, false);
  });

  test('personas 0, negativas, decimales o texto → error', () => {
    for (const personas of ['0', '-1', '2.5', 'dos', '']) {
      assert.equal(searchDestinationsSchema.safeParse({ fecha: '2026-12-10', personas }).success, false, personas);
    }
  });

  test('fecha con otro formato o inexistente → error', () => {
    for (const fecha of ['10/12/2026', '2026-02-30', '2026-13-01']) {
      assert.equal(searchDestinationsSchema.safeParse({ fecha, personas: '1' }).success, false, fecha);
    }
  });

  test('parámetro repetido (?lugar=a&lugar=b) → error', () => {
    assert.equal(searchDestinationsSchema.safeParse({ lugar: ['a', 'b'] }).success, false);
  });
});

describe('isFutureTravelDate (CU-01: la fecha debe ser futura)', () => {
  // 21:00 del 03/11/2026 en Costa Rica
  const NOW = new Date('2026-11-04T03:00:00Z');

  test('mañana → true', () => {
    assert.equal(isFutureTravelDate('2026-11-04', NOW), true);
  });

  test('hoy → false (aunque en UTC ya sea el 04/11)', () => {
    assert.equal(isFutureTravelDate('2026-11-03', NOW), false);
  });

  test('ayer → false', () => {
    assert.equal(isFutureTravelDate('2026-11-02', NOW), false);
  });
});