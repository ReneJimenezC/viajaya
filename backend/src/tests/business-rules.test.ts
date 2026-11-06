// Pruebas unitarias de las reglas de negocio RN-01 a RN-04 (SAD: pruebas unitarias
// de RN-01 a RN-04). Son funciones puras: no usan base de datos ni Express.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SimulatedPaymentGateway } from '../services/payment-gateway';
import { calculateQuote, canChangeReservation, hasCapacity, travelDayStart } from '../services/business-rules';
describe('RN-01 cupo diario (hasCapacity)', () => {
  test('cabe justo en la capacidad → true', () => {
    assert.equal(hasCapacity({ dailyCapacity: 20, reservedPeople: 18, requestedPeople: 2 }), true);
  });

  test('una persona de más → false (sobrecupo)', () => {
    assert.equal(hasCapacity({ dailyCapacity: 20, reservedPeople: 18, requestedPeople: 3 }), false);
  });

  test('destino vacío y grupo más grande que la capacidad → false', () => {
    assert.equal(hasCapacity({ dailyCapacity: 20, reservedPeople: 0, requestedPeople: 22 }), false);
  });

  test('0 personas o valores negativos o decimales → error', () => {
    assert.throws(() => hasCapacity({ dailyCapacity: 20, reservedPeople: 0, requestedPeople: 0 }), RangeError);
    assert.throws(() => hasCapacity({ dailyCapacity: 20, reservedPeople: -1, requestedPeople: 1 }), RangeError);
    assert.throws(() => hasCapacity({ dailyCapacity: 20, reservedPeople: 0, requestedPeople: 1.5 }), RangeError);
  });
});

describe('RN-02 ventana de 48 h (canChangeReservation)', () => {
  // Viaje el 10/11/2026: el día empieza a las 00:00 de Costa Rica = 06:00 UTC
  const TRAVEL_DATE = '2026-11-10';

  test('el día del viaje empieza a las 00:00 de Costa Rica (06:00 UTC)', () => {
    assert.equal(travelDayStart(TRAVEL_DATE).toISOString(), '2026-11-10T06:00:00.000Z');
  });

  test('faltan 48 h y 1 minuto → true', () => {
    assert.equal(canChangeReservation(TRAVEL_DATE, new Date('2026-11-07T23:59:00-06:00')), true);
  });

  test('faltan exactamente 48 h → false (debe ser MÁS de 48 h)', () => {
    assert.equal(canChangeReservation(TRAVEL_DATE, new Date('2026-11-08T00:00:00-06:00')), false);
  });

  test('faltan menos de 48 h → false', () => {
    assert.equal(canChangeReservation(TRAVEL_DATE, new Date('2026-11-09T10:00:00-06:00')), false);
  });

  test('el viaje ya pasó → false', () => {
    assert.equal(canChangeReservation(TRAVEL_DATE, new Date('2026-11-11T09:00:00-06:00')), false);
  });

  test('fechas inválidas → error', () => {
    for (const date of ['2026-02-30', '2026-13-01', '10/11/2026', '']) {
      assert.throws(() => travelDayStart(date), RangeError, date);
    }
  });
});

describe('RN-03 tarifa (calculateQuote)', () => {
  test('₡42 500 × 2 personas → subtotal 85 000, IVA 11 050, total 96 050', () => {
    assert.deepEqual(calculateQuote('42500.00', 2), {
      basePrice: '42500.00',
      people: 2,
      subtotal: '85000.00',
      iva: '11050.00',
      total: '96050.00',
    });
  });

  test('IVA con céntimos se redondea al céntimo: 1234.57 × 3', () => {
    // subtotal 3703.71; IVA = 481.4823 → 481.48; total 4185.19
    const quote = calculateQuote('1234.57', 3);
    assert.equal(quote.subtotal, '3703.71');
    assert.equal(quote.iva, '481.48');
    assert.equal(quote.total, '4185.19');
  });

  test('medio céntimo se redondea hacia arriba: 0.05 → IVA 0.0065 → 0.01', () => {
    assert.equal(calculateQuote('0.05', 1).iva, '0.01');
  });

  test('sin errores de punto flotante: 0.10 × 3 → 0.30 (no 0.30000000000000004)', () => {
    assert.equal(calculateQuote('0.10', 3).subtotal, '0.30');
  });

  test('acepta el precio con o sin decimales', () => {
    assert.equal(calculateQuote('42500', 1).basePrice, '42500.00');
    assert.equal(calculateQuote('42500.5', 1).basePrice, '42500.50');
  });

  test('personas o precios inválidos → error', () => {
    assert.throws(() => calculateQuote('42500.00', 0), RangeError);
    assert.throws(() => calculateQuote('42500.00', 2.5), RangeError);
    assert.throws(() => calculateQuote('0.00', 1), RangeError);
    assert.throws(() => calculateQuote('-100', 1), RangeError);
    assert.throws(() => calculateQuote('12.345', 1), RangeError);
    assert.throws(() => calculateQuote('abc', 1), RangeError);
  });
});

describe('RN-04 pasarela simulada (SimulatedPaymentGateway)', () => {
  const gateway = new SimulatedPaymentGateway();

  test('último dígito par → aprobado', async () => {
    assert.deepEqual(await gateway.charge({ cardNumber: '4111111111111112', amount: '96050.00' }), {
      approved: true,
      lastDigit: 2,
    });
  });

  test('último dígito 0 (par) → aprobado', async () => {
    assert.equal((await gateway.charge({ cardNumber: '4111111111111110', amount: '1.00' })).approved, true);
  });

  test('último dígito impar → rechazado', async () => {
    assert.deepEqual(await gateway.charge({ cardNumber: '4111111111111111', amount: '96050.00' }), {
      approved: false,
      lastDigit: 1,
    });
  });

  test('número con letras, espacios o muy corto → error', async () => {
    for (const cardNumber of ['4111-1111-1111-1112', '4111 1111 1111 1112', '12345', '']) {
      await assert.rejects(gateway.charge({ cardNumber, amount: '1.00' }), RangeError);
    }
  });
});