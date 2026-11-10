// Pruebas unitarias de parseId (controllers/parse-id.ts): el :id de las rutas del admin.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../errors/app-error';
import { parseId } from '../controllers/parse-id';

describe('parseId (:id de las rutas del admin)', () => {
  test('ids válidos → número; el mayor que cabe en un integer de Postgres también', () => {
    assert.equal(parseId('1', 'x'), 1);
    assert.equal(parseId('12', 'x'), 12);
    assert.equal(parseId('2147483647', 'x'), 2_147_483_647);
  });

  test('id imposible → 404 con el mensaje que se le pasa (destinos o reservas)', () => {
    const invalid = ['abc', '0', '-1', '1.5', '01', ' 1', '1e3', '', '2147483648', '99999999999'];
    for (const value of invalid) {
      assert.throws(
        () => parseId(value, 'La reserva no existe'),
        (error: unknown) => error instanceof AppError && error.status === 404 && error.message === 'La reserva no existe',
        `"${value}" debería dar 404`,
      );
    }
    // Sin valor o repetido (?id=1&id=2 llega como arreglo) → también 404
    for (const value of [undefined, ['1', '2']]) {
      assert.throws(() => parseId(value, 'El destino no existe'), AppError);
    }
  });
});