// Pruebas unitarias de la reserva (RF-03, CU-03), la consulta (RF-04, CU-04) y el cambio de fecha
// (RF-05, CU-05): las plantillas del body, el código de confirmación y ReservationService.
// No usan base de datos (decisión 7 = B): la transacción, los repositorios y la pasarela se
// reemplazan por versiones falsas en memoria.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../errors/app-error';
import type { Destination } from '../models/destination.entity';
import {
  createReservationSchema,
  lookupReservationSchema,
  rescheduleReservationSchema,
  type CreateReservationInput,
} from '../models/reservation.schema';
import type { NewPayment, NewReservation, ReservationDetails } from '../repositories/reservation.repository';
import { SimulatedPaymentGateway } from '../services/payment-gateway';
import {
  generateConfirmationCode,
  ReservationService,
  type RunInTransaction,
} from '../services/reservation.service';

// 21:00 del 03/11/2026 en Costa Rica: "mañana" es el 04/11
const NOW = new Date('2026-11-04T03:00:00Z');
const CREATED_AT = new Date('2026-11-04T03:00:01Z');

// Tortuguero: capacidad 20, ₡47 500, activo. Volcán Irazú: desactivado.
const TORTUGUERO = {
  id: 4, name: 'Tortuguero', description: null, place: 'Tortuguero, Limón',
  basePrice: '47500.00', dailyCapacity: 20, active: true,
} as Destination;
const IRAZU = { ...TORTUGUERO, id: 14, name: 'Volcán Irazú', active: false } as Destination;

// Body válido (tarjeta terminada en 2 = par = aprobada)
const INPUT: CreateReservationInput = {
  destinationId: 4,
  travelDate: '2026-11-20',
  people: 2,
  customerName: 'Ana Mora',
  customerEmail: 'ana@correo.com',
  cardNumber: '4111111111111112',
};

// Lo que el servicio hizo con la "base" falsa, para revisarlo en cada prueba
interface Recorder {
  transactions: number;
  lockedIds: number[];
  insertedReservations: NewReservation[];
  insertedPayments: NewPayment[];
  charges: number;
  // NUEVO (6.D): con qué código y correo se buscó en la consulta
  lookups: { code: string; email: string }[];
  // NUEVO (6.E): fechas guardadas por updateTravelDate (id de la reserva y fecha nueva)
  updatedDates: { id: number; travelDate: string }[];
}

// Arma un ReservationService con piezas falsas.
// - reservedInTortuguero: personas ya reservadas ese día en Tortuguero
// - takenCodes: códigos que "ya existen" (insertIfNewCode devuelve null con ellos)
// - codes: códigos que irá entregando el generador, en orden
// - stored: NUEVO (6.D) reservas activas que la consulta falsa "encuentra" (por código + correo).
//   En 6.E se copian (para que una prueba no cambie las de otra) y su id es su posición + 1.
function buildService(
  options: { reservedInTortuguero?: number; takenCodes?: string[]; codes?: string[]; stored?: ReservationDetails[] } = {},
) {
  const { reservedInTortuguero = 18, takenCodes = [], codes, stored = [] } = options;
  const recorder: Recorder = {
    transactions: 0, lockedIds: [], insertedReservations: [], insertedPayments: [], charges: 0, lookups: [], updatedDates: [],
  };
  // NUEVO (6.E): copia de las reservas guardadas; updateTravelDate cambia la copia
  const rows = stored.map((r) => ({ ...r }));
  const findRow = (code: string, email: string) => rows.find((r) => r.code === code && r.customerEmail === email);
  const byId = new Map([[TORTUGUERO.id, TORTUGUERO], [IRAZU.id, IRAZU]]);

  // Transacción falsa: cuenta cuántas se abren y entrega repositorios en memoria
  const runInTransaction: RunInTransaction = async (work) => {
    recorder.transactions++;
    return work({
      destinations: {
        findByIdForUpdate: async (id: number) => {
          recorder.lockedIds.push(id);
          return byId.get(id) ?? null;
        },
        reservedPeopleOn: async (_date: string, ids: number[]) =>
          new Map(ids.includes(TORTUGUERO.id) ? [[TORTUGUERO.id, reservedInTortuguero]] : []),
      },
      reservations: {
        insertIfNewCode: async (data: NewReservation) => {
          if (takenCodes.includes(data.code)) return null;
          recorder.insertedReservations.push(data);
          return { id: 57, createdAt: CREATED_AT };
        },
        insertPayment: async (data: NewPayment) => {
          recorder.insertedPayments.push(data);
        },
        // NUEVO (6.D): devuelve la reserva guardada solo si coinciden código Y correo
        findActiveByCodeAndEmail: async (code: string, email: string) => {
          recorder.lookups.push({ code, email });
          return findRow(code, email) ?? null;
        },
        // NUEVO (6.E): la reserva "bloqueada" (id, destino y fecha actual)
        findActiveForUpdate: async (code: string, email: string) => {
          const row = findRow(code, email);
          return row ? { id: rows.indexOf(row) + 1, destinationId: row.destination.id, travelDate: row.travelDate } : null;
        },
        // NUEVO (6.E): anota el cambio y lo aplica a la copia
        updateTravelDate: async (id: number, travelDate: string) => {
          recorder.updatedDates.push({ id, travelDate });
          const row = rows[id - 1];
          if (row) row.travelDate = travelDate;
        },
      },
    });
  };

  // Pasarela real (RN-04 ya probada), envuelta para contar los cobros
  const realGateway = new SimulatedPaymentGateway();
  const gateway = {
    charge: (request: { cardNumber: string; amount: string }) => {
      recorder.charges++;
      return realGateway.charge(request);
    },
  };

  const queue = codes ? [...codes] : undefined;
  const generateCode = queue ? () => queue.shift() ?? 'VY-ZZZZZZZZ' : undefined;
  return { service: new ReservationService(runInTransaction, gateway, generateCode), recorder };
}

// Comprueba que la promesa falle con un AppError del código HTTP indicado y lo devuelve
async function rejectsWith(promise: Promise<unknown>, status: number): Promise<AppError> {
  let caught: unknown;
  await assert.rejects(promise, (error: unknown) => {
    caught = error;
    return error instanceof AppError && error.status === status;
  });
  return caught as AppError;
}

// NUEVO (6.D): la reserva de Ana tal como la devolvería la base en la consulta
const STORED: ReservationDetails = {
  code: 'VY-7K3M9QXT',
  status: 'Pendiente',
  destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
  travelDate: '2026-11-20',
  customerName: 'Ana Mora',
  customerEmail: 'ana@correo.com',
  people: 2,
  basePrice: '47500.00',
  subtotal: '95000.00',
  iva: '12350.00',
  total: '107350.00',
  payment: { status: 'Aprobado', cardLastDigit: 2 },
  createdAt: CREATED_AT,
};

describe('createReservationSchema (body de POST /reservas)', () => {
  test('datos válidos → nombre sin espacios, correo en minúsculas, campos extra fuera', () => {
    const parsed = createReservationSchema.parse({
      ...INPUT,
      customerName: '  Ana Mora ',
      customerEmail: ' Ana@Correo.COM',
      total: '1.00',
    });
    assert.deepEqual(parsed, INPUT);
  });

  test('usa las mismas reglas de la cotización (personas 0 → error en people)', () => {
    const result = createReservationSchema.safeParse({ ...INPUT, people: 0 });
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')), ['people']);
  });

  test('body vacío → error en los 6 campos', () => {
    const result = createReservationSchema.safeParse({});
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')).sort(), [
      'cardNumber', 'customerEmail', 'customerName', 'destinationId', 'people', 'travelDate',
    ]);
  });

  test('nombre vacío o de más de 100 caracteres → error', () => {
    for (const customerName of ['   ', 'a'.repeat(101)]) {
      assert.equal(createReservationSchema.safeParse({ ...INPUT, customerName }).success, false);
    }
  });

  test("nombres reales con tildes, ñ, apóstrofe o guion → válidos", () => {
    for (const customerName of ["José Peña", "Liam O'Neil", 'María Pérez-Soto']) {
      assert.equal(createReservationSchema.safeParse({ ...INPUT, customerName }).success, true, customerName);
    }
  });

  test('correo sin formato → error', () => {
    assert.equal(createReservationSchema.safeParse({ ...INPUT, customerEmail: 'ana@' }).success, false);
  });

  test('tarjeta con guiones, espacios, corta, larga o como número → error', () => {
    for (const cardNumber of ['4111-1111-1111-1112', '4111 1111 1111 1112', '123456789012', '1'.repeat(20), 4111111111111112]) {
      assert.equal(createReservationSchema.safeParse({ ...INPUT, cardNumber }).success, false, String(cardNumber));
    }
  });
});

describe('generateConfirmationCode', () => {
  test('forma "VY-" + 8 caracteres del alfabeto, sin 0, O, 1, I ni L', () => {
    for (let i = 0; i < 2000; i++) {
      assert.match(generateConfirmationCode(), /^VY-[2-9A-HJKMNP-Z]{8}$/);
    }
  });

  test('2000 códigos seguidos → ninguno repetido', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateConfirmationCode()));
    assert.equal(codes.size, 2000);
  });

  // NUEVO (6.D): lo que se genera y lo que la consulta acepta salen del MISMO alfabeto
  test('todo código generado pasa la validación de la consulta', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateConfirmationCode();
      assert.equal(lookupReservationSchema.safeParse({ code, customerEmail: 'ana@correo.com' }).success, true, code);
    }
  });
});

describe('ReservationService.create (CU-03)', () => {
  test('cabe justo (18 + 2 = 20) y pago aprobado → reserva Pendiente, pago Aprobado, todo el desglose', async () => {
    const { service, recorder } = buildService({ codes: ['VY-7K3M9QXT'] });
    const { reservationId, reservation } = await service.create(INPUT, NOW);

    assert.equal(reservationId, 57);
    assert.deepEqual(reservation, {
      code: 'VY-7K3M9QXT',
      status: 'Pendiente',
      destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
      travelDate: '2026-11-20',
      customerName: 'Ana Mora',
      customerEmail: 'ana@correo.com',
      quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva: '12350.00', total: '107350.00' },
      payment: { status: 'Aprobado', cardLastDigit: 2 },
      createdAt: CREATED_AT,
    });
    // Se bloqueó el destino antes de todo y se guardaron la reserva y su pago
    assert.deepEqual(recorder.lockedIds, [4]);
    assert.equal(recorder.insertedReservations[0]?.total, '107350.00');
    assert.deepEqual(recorder.insertedPayments, [
      { reservationId: 57, amount: '107350.00', cardLastDigit: 2, status: 'Aprobado' },
    ]);
  });

  test('pago rechazado (tarjeta impar, CU-03 6a) → 402 PAYMENT_DECLINED y no se guarda nada', async () => {
    const { service, recorder } = buildService();
    const error = await rejectsWith(service.create({ ...INPUT, cardNumber: '4111111111111113' }, NOW), 402);
    assert.equal(error.code, 'PAYMENT_DECLINED');
    assert.equal(recorder.charges, 1);
    assert.equal(recorder.insertedReservations.length, 0);
    assert.equal(recorder.insertedPayments.length, 0);
  });

  test('sin cupo (18 + 3 > 20, CU-03 5a) → 409 con los cupos, sin cobrar ni guardar', async () => {
    const { service, recorder } = buildService();
    const error = await rejectsWith(service.create({ ...INPUT, people: 3 }, NOW), 409);
    assert.match(error.message, /Cupos disponibles: 2$/);
    assert.equal(recorder.charges, 0);
    assert.equal(recorder.insertedReservations.length, 0);
  });

  test('destino desactivado o inexistente → el mismo 404, sin cobrar', async () => {
    const { service, recorder } = buildService();
    const inactive = await rejectsWith(service.create({ ...INPUT, destinationId: 14 }, NOW), 404);
    const missing = await rejectsWith(service.create({ ...INPUT, destinationId: 999 }, NOW), 404);
    assert.equal(inactive.message, missing.message);
    assert.equal(recorder.charges, 0);
  });

  test('fecha de hoy en Costa Rica → 400 travelDate, sin abrir la transacción', async () => {
    const { service, recorder } = buildService();
    const error = await rejectsWith(service.create({ ...INPUT, travelDate: '2026-11-03' }, NOW), 400);
    assert.equal(error.details?.[0]?.field, 'travelDate');
    assert.equal(recorder.transactions, 0);
  });

  test('código repetido → se genera otro y la reserva se guarda con el segundo', async () => {
    const { service, recorder } = buildService({ takenCodes: ['VY-AAAAAAAA'], codes: ['VY-AAAAAAAA', 'VY-BBBBBBBB'] });
    const { reservation } = await service.create(INPUT, NOW);
    assert.equal(reservation.code, 'VY-BBBBBBBB');
    assert.equal(recorder.insertedReservations.length, 1);
  });

  test('3 códigos repetidos seguidos → error interno (500) y no se guarda el pago', async () => {
    const taken = ['VY-AAAAAAAA', 'VY-BBBBBBBB', 'VY-CCCCCCCC'];
    const { service, recorder } = buildService({ takenCodes: taken, codes: taken });
    await assert.rejects(service.create(INPUT, NOW), (error: unknown) => error instanceof Error && !(error instanceof AppError));
    assert.equal(recorder.insertedPayments.length, 0);
  });
});

// ---------------------------------------------------------------------------------------
// NUEVO (6.D): consulta de una reserva (RF-04, CU-04)
// ---------------------------------------------------------------------------------------

describe('lookupReservationSchema (body de POST /reservas/consulta)', () => {
  test('código en minúsculas y con espacios, correo con mayúsculas → normalizados', () => {
    assert.deepEqual(
      lookupReservationSchema.parse({ code: ' vy-7k3m9qxt ', customerEmail: ' Ana@Correo.COM', extra: 1 }),
      { code: 'VY-7K3M9QXT', customerEmail: 'ana@correo.com' },
    );
  });

  test('código con otra forma o con caracteres que no existen en el alfabeto → error en code', () => {
    // Corto, otro prefijo, sin guion, largo, con 0/O/1/I/L, como número
    for (const code of ['VY-123', 'AB-7K3M9QXT', 'VY7K3M9QXT', 'VY-7K3M9QXTA', 'VY-0K3M9QXT', 'VY-OK3M9QXT', 'VY-1K3M9QXT', 'VY-IK3M9QXT', 'VY-LK3M9QXT', 12345678]) {
      const result = lookupReservationSchema.safeParse({ code, customerEmail: 'ana@correo.com' });
      assert.equal(result.success, false, String(code));
      assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')), ['code'], String(code));
    }
  });

  test('body vacío → error en los 2 campos', () => {
    const result = lookupReservationSchema.safeParse({});
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')).sort(), ['code', 'customerEmail']);
  });
});

describe('ReservationService.lookup (CU-04)', () => {
  test('código y correo correctos → la reserva con la MISMA forma que al crearla (decisión 11)', async () => {
    // Se crea una reserva y luego se consulta la misma: las dos respuestas deben ser idénticas
    const created = await buildService({ codes: ['VY-7K3M9QXT'] }).service.create(INPUT, NOW);
    const { service, recorder } = buildService({ stored: [STORED] });
    const found = await service.lookup({ code: 'VY-7K3M9QXT', customerEmail: 'ana@correo.com' });
    assert.deepEqual(found, created.reservation);
    assert.deepEqual(recorder.lookups, [{ code: 'VY-7K3M9QXT', email: 'ana@correo.com' }]);
  });

  test('correo que no coincide → 404 con el mensaje exacto de CU-04 5a', async () => {
    const { service } = buildService({ stored: [STORED] });
    const error = await rejectsWith(service.lookup({ code: 'VY-7K3M9QXT', customerEmail: 'otra@correo.com' }), 404);
    assert.equal(error.message, 'No se encontró una reserva activa que coincida con los datos');
  });

  test('código inexistente → el mismo 404 que con el correo equivocado (no da pistas)', async () => {
    const { service } = buildService({ stored: [STORED] });
    const wrongCode = await rejectsWith(service.lookup({ code: 'VY-AAAAAAAA', customerEmail: 'ana@correo.com' }), 404);
    const wrongEmail = await rejectsWith(service.lookup({ code: 'VY-7K3M9QXT', customerEmail: 'otra@correo.com' }), 404);
    assert.equal(wrongCode.message, wrongEmail.message);
  });

  test('la consulta no cobra, no bloquea destinos ni guarda nada', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    await service.lookup({ code: 'VY-7K3M9QXT', customerEmail: 'ana@correo.com' });
    assert.equal(recorder.charges, 0);
    assert.deepEqual(recorder.lockedIds, []);
    assert.equal(recorder.insertedReservations.length + recorder.insertedPayments.length, 0);
  });
});

// ---------------------------------------------------------------------------------------
// NUEVO (6.E): cambio de fecha (RF-05, CU-05). NOW = 21:00 del 03/11 en Costa Rica.
// ---------------------------------------------------------------------------------------

// Pide mover la reserva de Ana (viaje el 20/11) al 25/11
const RESCHEDULE = { code: 'VY-7K3M9QXT', customerEmail: 'ana@correo.com', travelDate: '2026-11-25' };

describe('rescheduleReservationSchema (body de PATCH /reservas/fecha)', () => {
  test('código y correo como en la consulta + fecha nueva → normalizados', () => {
    assert.deepEqual(
      rescheduleReservationSchema.parse({ code: ' vy-7k3m9qxt', customerEmail: 'Ana@Correo.com', travelDate: '2026-11-25', people: 9 }),
      RESCHEDULE,
    );
  });

  test('body vacío → error en los 3 campos', () => {
    const result = rescheduleReservationSchema.safeParse({});
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues.map((i) => i.path.join('.')).sort(), ['code', 'customerEmail', 'travelDate']);
  });
});

describe('ReservationService.reschedule (CU-05)', () => {
  test('más de 48 h y hay cupo (18 + 2 = 20) → 200 con la fecha nueva, el mismo monto y la misma forma', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    const { reservationId, reservation } = await service.reschedule(RESCHEDULE, NOW);
    assert.equal(reservationId, 1);
    assert.deepEqual(reservation, {
      code: 'VY-7K3M9QXT',
      status: 'Pendiente',
      destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
      travelDate: '2026-11-25',
      customerName: 'Ana Mora',
      customerEmail: 'ana@correo.com',
      quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva: '12350.00', total: '107350.00' },
      payment: { status: 'Aprobado', cardLastDigit: 2 },
      createdAt: CREATED_AT,
    });
    // Se bloqueó el destino (SAD 3.2) y se guardó la fecha nueva una sola vez
    assert.deepEqual(recorder.lockedIds, [4]);
    assert.deepEqual(recorder.updatedDates, [{ id: 1, travelDate: '2026-11-25' }]);
  });

  test('faltan 48 h o menos para la fecha ORIGINAL (RN-02, CU-05 5a) → 422 y la reserva no cambia', async () => {
    // Viaje el 05/11: empieza a las 00:00 del 05/11 en CR; desde las 21:00 del 03/11 faltan 27 h
    const { service, recorder } = buildService({ stored: [{ ...STORED, travelDate: '2026-11-05' }] });
    const error = await rejectsWith(service.reschedule(RESCHEDULE, NOW), 422);
    assert.equal(error.code, 'BUSINESS_RULE');
    assert.equal(error.message, 'La reserva no se puede modificar porque faltan 48 horas o menos para la fecha del viaje');
    assert.deepEqual(recorder.lockedIds, []);
    assert.deepEqual(recorder.updatedDates, []);
  });

  test('código o correo que no coinciden (CU-05 4a) → el mismo 404 de la consulta', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    const error = await rejectsWith(service.reschedule({ ...RESCHEDULE, customerEmail: 'otra@correo.com' }, NOW), 404);
    assert.equal(error.message, 'No se encontró una reserva activa que coincida con los datos');
    assert.deepEqual(recorder.updatedDates, []);
  });

  test('la misma fecha que ya tiene (V1) → 400 travelDate y no se guarda nada', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    const error = await rejectsWith(service.reschedule({ ...RESCHEDULE, travelDate: '2026-11-20' }, NOW), 400);
    assert.equal(error.details?.[0]?.message, 'La nueva fecha debe ser distinta de la actual');
    assert.deepEqual(recorder.updatedDates, []);
  });

  test('destino desactivado después de reservar (V2) → 409 y no se guarda nada', async () => {
    const atIrazu = { ...STORED, destination: { id: 14, name: 'Volcán Irazú', place: 'Tortuguero, Limón' } };
    const { service, recorder } = buildService({ stored: [atIrazu] });
    const error = await rejectsWith(service.reschedule(RESCHEDULE, NOW), 409);
    assert.equal(error.message, 'El destino ya no está disponible para cambiar la fecha');
    assert.deepEqual(recorder.updatedDates, []);
  });

  test('sin cupo en la fecha nueva (19 + 2 > 20, RN-01, CU-05 8a) → 409 con los cupos y no se guarda nada', async () => {
    const { service, recorder } = buildService({ stored: [STORED], reservedInTortuguero: 19 });
    const error = await rejectsWith(service.reschedule(RESCHEDULE, NOW), 409);
    assert.match(error.message, /Cupos disponibles: 1$/);
    assert.deepEqual(recorder.updatedDates, []);
  });

  test('fecha nueva de hoy en Costa Rica → 400 travelDate, sin abrir la transacción', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    const error = await rejectsWith(service.reschedule({ ...RESCHEDULE, travelDate: '2026-11-03' }, NOW), 400);
    assert.equal(error.details?.[0]?.field, 'travelDate');
    assert.equal(recorder.transactions, 0);
  });

  test('el cambio no cobra nada (el monto queda igual)', async () => {
    const { service, recorder } = buildService({ stored: [STORED] });
    await service.reschedule(RESCHEDULE, NOW);
    assert.equal(recorder.charges, 0);
    assert.equal(recorder.insertedPayments.length, 0);
  });
});